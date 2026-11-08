<?php
/**
 * Plugin Name: Riff components (tests only)
 * Description: Shows every shared Listen component in every state at ?riff-components, for the e2e layout checks. Loaded only on the tests site; it is not in the plugin's zip.
 * Version: 1.0.0
 * License: GPL-2.0-or-later
 *
 * @package Riff
 */

use Riff\Listen\App;
use Riff\Listen\Browse;
use Riff\Listen\Ui;

defined( 'ABSPATH' ) || exit;

// The tests site keeps the last sign-in code Riff Sign In made, so the e2e suite can type it in
// place of reading an email, and answers it on a route of its own.
add_action(
	'riff_sign_in_code',
	static function ( string $email, string $code, string $link ): void {
		set_transient(
			'riff_test_sign_in_code',
			array(
				'email' => $email,
				'code'  => $code,
				'link'  => $link,
			),
			MINUTE_IN_SECONDS
		);
	},
	10,
	3
);
// What the e2e suite makes is marked with the spec and project that made it (tests/e2e/helpers/
// own.js), so a run that stopped before it cleaned up leaves nothing the next run trips over: each
// spec sweeps its own before it makes anything, and the suite sweeps every spec's as it starts.
add_action(
	'init',
	static function (): void {
		register_post_meta(
			'',
			'_riff_e2e',
			array(
				'type'          => 'string',
				'single'        => true,
				'show_in_rest'  => true,
				'auth_callback' => static fn() => current_user_can( 'edit_posts' ),
			)
		);
	}
);

add_action(
	'rest_api_init',
	static function (): void {
		// Deletes what the suite made: one spec's, or with no spec every spec's. Nothing unmarked.
		register_rest_route(
			'riff-test/v1',
			'/made',
			array(
				'methods'             => 'DELETE',
				'callback'            => static function ( WP_REST_Request $request ) {
					$spec  = (string) $request['spec'];
					$found = get_posts(
						array(
							'post_type'      => array_values( get_post_types() ),
							'post_status'    => array_keys( get_post_stati() ),
							'posts_per_page' => -1,
							'fields'         => 'ids',
							'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- a test route, run once per spec.
								'' === $spec
									? array(
										'key'     => '_riff_e2e',
										'compare' => 'EXISTS',
									)
									: array(
										'key'   => '_riff_e2e',
										'value' => $spec,
									),
							),
						)
					);
					foreach ( $found as $id ) {
						if ( 'attachment' === get_post_type( $id ) ) {
							wp_delete_attachment( $id, true );
						} else {
							wp_delete_post( $id, true );
						}
					}
					return rest_ensure_response( array( 'deleted' => count( $found ) ) );
				},
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
			)
		);
		// Whether anyone may register, which core's settings route does not expose, for the admin.
		register_rest_route(
			'riff-test/v1',
			'/registration',
			array(
				'methods'             => 'POST',
				'callback'            => static function ( WP_REST_Request $request ) {
					global $wpdb;
					update_option( 'users_can_register', rest_sanitize_boolean( $request['open'] ) ? 1 : 0 );
					// The code limits count over a quarter of an hour, per address and per network
					// address; a suite run on one machine starts each time with a clean slate.
					$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient%_riff_signin_rate_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
					return rest_ensure_response( array( 'open' => (bool) get_option( 'users_can_register' ) ) );
				},
				'permission_callback' => static fn() => current_user_can( 'manage_options' ),
			)
		);
		register_rest_route(
			'riff-test/v1',
			'/sign-in-code',
			array(
				'methods'             => 'GET',
				'callback'            => static fn() => rest_ensure_response( get_transient( 'riff_test_sign_in_code' ) ?: array() ), // phpcs:ignore Universal.Operators.DisallowShortTernary.Found
				'permission_callback' => '__return_true',
			)
		);
	}
);

add_action(
	'template_redirect',
	static function (): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page to look at; nothing changes.
		if ( ! isset( $_GET['riff-components'] ) || ! class_exists( Ui::class ) ) {
			return;
		}
		// The app's own stylesheet, which only a Listen page loads on its own.
		\Riff\Player::styles();
		wp_enqueue_style( 'riff-app' );
		$long = 'Vedi! Le fosche notturne spoglie, from Il Trovatore, Act Two, as arranged for the band';
		// A name that is one long word, as a library's tags sometimes are: it has to break, not widen the page.
		$word   = 'Supercalifragilisticexpialidociousandthensomemorewithoutanyspacesatall';
		$art    = includes_url( 'images/media/audio.svg' );
		$tracks = Browse::get( '/tracks', array( 'per_page' => 3 ) )['items'];
		$liked  = static fn( array $play ): string => Ui::card(
			array(
				'title' => 'Liked songs',
				'href'  => '#liked',
				'sub'   => $play ? '3 songs' : 'Press the heart on a song to keep it here',
				'heart' => true,
				'class' => 'riff-card-liked',
				'play'  => $play,
			)
		);
		$cards  = array(
			// An album with a cover, one by a long-named artist, one with no artist, then a post with
			// no cover, one with a long title, and one with no link.
			Ui::album(
				array(
					'id'     => 1,
					'name'   => 'Compositions',
					'artist' => 'The Airmen of Note',
					'art'    => array( array( 'src' => $art ) ),
				),
				'#album'
			),
			Ui::album(
				array(
					'id'     => 2,
					'name'   => 'Celtic Aire',
					'artist' => 'Celtic Aire, United States Air Force Band',
					'art'    => array( array( 'src' => $art ) ),
				),
				'#album2'
			),
			Ui::album(
				array(
					'id'   => 3,
					'name' => 'No artist',
				),
				'#album3'
			),
			Ui::card(
				array(
					'title' => 'No cover',
					'href'  => '#none',
					'sub'   => '2 tracks',
				)
			),
			Ui::card(
				array(
					'title' => $long,
					'href'  => '#long',
					'sub'   => $long,
					'art'   => $art,
				)
			),
			Ui::card(
				array(
					'title' => 'Not a link',
					'sub'   => 'A track with no post',
					'art'   => $art,
				)
			),
			// An artist, with a letter and with a picture.
			Ui::card(
				array(
					'title' => 'Airmen of Note',
					'href'  => '#artist',
					'sub'   => 'Artist',
					'mark'  => 'A',
					'class' => 'riff-card-artist',
				)
			),
			Ui::card(
				array(
					'title' => 'With a picture',
					'href'  => '#artist2',
					'sub'   => 'Artist',
					'art'   => $art,
					'class' => 'riff-card-artist',
				)
			),
			// Liked songs, empty and with songs to play.
			$liked( array() ),
			$liked(
				array(
					'action' => 'play-liked',
					'label'  => 'Play Liked songs',
					'data'   => array( 'tracks' => '[]' ),
				)
			),
		);
		$choice = static fn( string $label, bool $current ): array => array(
			'label'   => $label,
			'href'    => '#' . sanitize_title( $label ),
			'current' => $current,
		);
		$parts  = array(
			'card'    => '<div class="riff-grid">' . implode( '', $cards ) . '</div>',
			'shelf'   => Ui::shelf( 'mixed', 'A row of every card', '#all', implode( '', $cards ) ) . Ui::shelf( 'device', 'A row the script fills, hidden until then', '', '', true ),
			'header'  => App::header( 'An album', 'The Airmen of Note · 10 tracks · 42 min', 'Album', $art, '#3b4a6b', false, 'album', 1 )
				. App::header( 'An artist', '12 tracks · 2 albums', 'Artist', $art, '', true, 'artist', 2 )
				. App::header( $long, '2 tracks' )
				. App::header( $word, $word . ' · 1 track' )
				. App::header( $word, $word . ' · 1 track', 'Album', $art, '#3b4a6b', false, 'album', 5 ),
			'title'   => Ui::title( 'A view' ) . Ui::title( $long ) . Ui::title( $word ),
			'artists' => Ui::shelf(
				'artists',
				$word,
				'#artists',
				Browse::artist_items(
					array(
						array(
							'id'    => 2,
							'name'  => $word,
							'count' => 1,
						),
						array(
							'id'    => 1,
							'name'  => 'The Airmen of Note',
							'count' => 10,
						),
					),
					'#'
				),
				false,
				'ul'
			) . '<ul class="riff-artists">' . Browse::artist_items(
				array(
					array(
						'id'    => 1,
						'name'  => 'The Airmen of Note',
						'count' => 10,
					),
					array(
						'id'    => 2,
						'name'  => $word,
						'count' => 1,
					),
				),
				'#'
			) . '</ul>',
			'actions' => Ui::actions() . Ui::actions( Ui::heart( 'album', 1, 'An album' ) ),
			'heart'   => str_replace( 'aria-pressed="false"', 'aria-pressed="true"', Ui::heart( 'album', 3, 'Liked' ) ) . Ui::heart( 'artist', 4, 'Not liked' ),
			'chips'   => '<div class="riff-library-bar">' . Ui::choices( 'Show', array( $choice( 'All', true ), $choice( 'Songs', false ), $choice( 'Albums', false ), $choice( 'Artists', false ) ) )
				. Ui::choices( 'Sort by', array( $choice( 'Recently added', true ), $choice( 'Alphabetical', false ) ), 'sort' ) . '</div>',
			'empty'   => Ui::empty_note( 'Nothing here yet. A note for an empty list.' ),
			'rows'    => $tracks ? Browse::rows( $tracks ) . Browse::rows( $tracks, true ) : Ui::empty_note( 'Upload a track to see rows.' ),
		);
		status_header( 200 );
		nocache_headers();
		?>
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Riff components</title>
		<?php wp_head(); ?>
</head>
<body>
<main class="riff-app" data-riff-app-ready>
	<div class="riff-app-view">
		<h1>Riff components</h1>
		<?php foreach ( $parts as $slug => $html ) : ?>
			<section class="riff-components" id="component-<?php echo esc_attr( $slug ); ?>" aria-label="<?php echo esc_attr( $slug ); ?>">
				<h2 class="riff-app-section"><?php echo esc_html( $slug ); ?></h2>
				<?php echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the components escape their own output. ?>
			</section>
		<?php endforeach; ?>
	</div>
</main>
		<?php wp_footer(); ?>
</body>
</html>
		<?php
		exit;
	}
);

/*
 * A site with no music, for the first-run e2e test, without deleting anyone's media: while the
 * browser carries the riff_test_no_music cookie, every audio file, album, artist, track and post
 * with tracks is hidden from that request. Loaded only on the tests site.
 */
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a test switch; nothing changes.
if ( ! empty( $_COOKIE['riff_test_no_music'] ) ) {
	add_filter(
		'posts_pre_query',
		static function ( $posts, $query ) {
			$mime = $query->get( 'post_mime_type' );
			return 'audio' === $mime || ( is_string( $mime ) && str_starts_with( $mime, 'audio/' ) ) ? array() : $posts;
		},
		10,
		2
	);
	// The library and Home's New posts ask for posts outside the main query; with no music, they
	// find none.
	add_action(
		'pre_get_posts',
		static function ( WP_Query $query ): void {
			if ( ! $query->is_main_query() && 'post' === $query->get( 'post_type' ) ) {
				$query->set( 'post__in', array( 0 ) );
			}
		}
	);
	add_filter(
		'rest_pre_dispatch',
		static function ( $result, $server, $request ) {
			unset( $server );
			if ( preg_match( '#^/riff/v1/(albums|artists|tracks|library)$#', $request->get_route() ) ) {
				return rest_ensure_response(
					array(
						'items' => array(),
						'page'  => 1,
						'pages' => 0,
						'total' => 0,
					)
				);
			}
			return $result;
		},
		10,
		3
	);
}

// Marks the page as the tests site's, so riff.js hands the e2e suite its whole door as
// window.riffInternal: likes, playlists and history, which window.riff leaves out.
add_action(
	'wp_head',
	static function (): void {
		wp_print_inline_script_tag( "document.documentElement.setAttribute( 'data-riff-test', '' );" );
	},
	1
);

/*
 * A site that turned the turntable off, through the riff_turntable filter as a plugin would, while
 * the browser carries the riff_test_no_turntable cookie. Loaded only on the tests site.
 */
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a test switch; nothing changes.
if ( ! empty( $_COOKIE['riff_test_no_turntable'] ) ) {
	add_filter( 'riff_turntable', '__return_false' );
}

/*
 * A control registered on the server, as a plugin registers one, while the browser carries the
 * riff_test_control cookie: the page has it before any script, and its script gives it its press.
 * Loaded only on the tests site.
 */
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a test switch; nothing changes.
if ( ! empty( $_COOKIE['riff_test_control'] ) ) {
	add_action(
		'riff_register',
		static fn() => riff_register_control(
			'e2e-server',
			array(
				'label' => 'Server control',
				'icon'  => 'share',
				'order' => 66,
			)
		)
	);
}

/*
 * A keyboard shortcut registered on the server, as a plugin registers one, while the browser
 * carries the riff_test_shortcut cookie: listed on the profile with Riff's own, and given what it
 * does by the spec's script. Loaded only on the tests site.
 */
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a test switch; nothing changes.
if ( ! empty( $_COOKIE['riff_test_shortcut'] ) ) {
	add_action(
		'riff_register',
		static function (): void {
			riff_register_shortcut(
				'e2e-key',
				array(
					'key'   => 'o',
					'label' => 'Say hello',
				)
			);
			riff_register_shortcut(
				'e2e-mark',
				array(
					'key'   => ']',
					'label' => 'Say goodbye',
				)
			);
		}
	);
}

/*
 * A section of the About panel added as a plugin adds one, through the riff_about_sections filter,
 * while the browser carries the riff_test_about_section cookie: drawn hidden before any script, in
 * its order between the track and the credits, for the spec's script to fill. Loaded only on the
 * tests site.
 */
// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a test switch; nothing changes.
if ( ! empty( $_COOKIE['riff_test_about_section'] ) ) {
	add_filter(
		'riff_about_sections',
		static function ( $sections ) {
			$sections['e2e-about'] = array(
				'label' => 'From a plugin',
				'order' => 15,
			);
			return $sections;
		}
	);
}

// A plugin's view of the Listen app (riff_app_views), while the riff_test_app_view setting is on,
// for tests/e2e/app/app-views.spec.js: for someone who may upload, in the sidebar and the account
// menu, with a script that marks what it drew when riff:app_view says it shows; and no Posts.
add_action(
	'init',
	static function (): void {
		register_setting(
			'riff-test',
			'riff_test_app_view',
			array(
				'type'         => 'boolean',
				'default'      => false,
				'show_in_rest' => true,
			)
		);
		wp_register_script( 'riff-test-view', false, array(), '1', true );
		wp_add_inline_script(
			'riff-test-view',
			"document.addEventListener( 'riff:app_view', function ( e ) { window.riffTestViews = ( window.riffTestViews || [] ).concat( e.detail.view ); var mine = e.detail.panel.querySelector( '.riff-test-view' ); if ( 'test-view' === e.detail.view && mine ) { mine.dataset.bound = String( ( Number( mine.dataset.bound ) || 0 ) + 1 ); } } );"
		);
	}
);
add_filter(
	'riff_app_views',
	static function ( $views ) {
		if ( ! get_option( 'riff_test_app_view' ) ) {
			return $views;
		}
		unset( $views['posts'] );
		$views['test-view'] = array(
			'label'      => 'Test view',
			'icon'       => 'heart',
			'nav'        => array( 'sidebar', 'account' ),
			'capability' => 'upload_files',
			'render'     => static fn(): string => '<p class="riff-test-view">Drawn by a plugin.</p>',
			'script'     => 'riff-test-view',
		);
		return $views;
	}
);
