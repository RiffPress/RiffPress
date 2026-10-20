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

add_action(
	'template_redirect',
	static function (): void {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page to look at; nothing changes.
		if ( ! isset( $_GET['riff-components'] ) || ! class_exists( Ui::class ) ) {
			return;
		}
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
	// The library asks for Library::PER_PAGE posts; with no music, it finds none. The first-run
	// test deactivates Riff, so the class may not be there.
	add_action(
		'pre_get_posts',
		static function ( WP_Query $query ): void {
			if ( class_exists( Riff\Library::class ) && Riff\Library::PER_PAGE === (int) $query->get( 'posts_per_page' ) ) {
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
