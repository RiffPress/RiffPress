<?php
/**
 * About: a panel beside the page about the track playing.
 *
 * @since 5.9.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * About is a panel beside the page, as Up next is, registered as any plugin's view is: the track's
 * cover, its title, its artist and its album, each a link to its page in the Listen app, and the
 * credits its file's own tags carry, which WordPress read on upload (composer, lyricist, genre,
 * label and the rest). Nothing is fetched from anywhere else, and a tag the file lacks is left out.
 *
 * Its parts are sections in the order the `riff_about_sections` filter gives them. Riff's own, the
 * track and its credits, are two of them, and a plugin adds one there and fills it as the panel
 * opens, through the `riff.view` action, as Riff fills its own (assets/player/about.js).
 */
final class About {

	/**
	 * The view's id: the panel is `[data-riff-panel="about"]`.
	 *
	 * @since 5.9.0
	 */
	public const VIEW = 'about';

	/**
	 * Where the site's Listen page is kept between requests: its ID, or 0 when it has none.
	 */
	private const LISTEN = 'riff_listen_page';

	/**
	 * A section's id: lowercase letters, digits and dashes, starting with a letter, as a view's is.
	 */
	private const ID = '/^[a-z][a-z0-9-]*$/';

	/**
	 * Hooks the panel, and forgets where the Listen page is when a page changes.
	 *
	 * @since 5.9.0
	 */
	public static function register(): void {
		add_action( Registry::HOOK, array( self::class, 'view' ), 5 );
		// A page saved, trashed or deleted may be the Listen page, or may now be one.
		add_action( 'clean_post_cache', array( self::class, 'forget' ), 10, 2 );
		add_action( 'wp_head', array( self::class, 'held' ), 1 );
	}

	/**
	 * Whether the panel opens by itself for a listener who has never opened or closed a panel: in
	 * the Listen app, where the page is the music and there is room beside it for the credits.
	 * Elsewhere the player waits at the foot of someone's page, and opens nothing of its own.
	 *
	 * @since 6.13.0
	 *
	 * @return bool
	 */
	public static function opens(): bool {
		return Player::enabled() && Player::listen_page() && isset( Registry::views( 'side' )[ self::VIEW ] );
	}

	/**
	 * Before the page is painted, the room beside it kept for the panel that will open there once
	 * the track resumes (assets/player/registry.js, reopen()): the one the listener left open, or
	 * About for one who never chose, so the page is laid out once rather than narrowing as the
	 * panel appears. Only a panel beside the page, never a sidebar view, which may dock instead.
	 * The class does nothing on a narrow screen (riff.css), and the script gives the room back if
	 * nothing opens.
	 *
	 * @since 6.13.0
	 */
	public static function held(): void {
		if ( ! self::opens() ) {
			return;
		}
		$side = array_map( 'strval', array_keys( Registry::views( 'side' ) ) );
		wp_print_inline_script_tag(
			sprintf(
				'try{var p=localStorage.getItem("riff:panel");if(%1$s.indexOf(p===null?%2$s:p)>-1&&sessionStorage.getItem("riff:state")){document.documentElement.classList.add("riff-panel-open");}}catch(e){}',
				wp_json_encode( $side ),
				wp_json_encode( self::VIEW )
			)
		);
	}

	/**
	 * The panel, after the song's own views and before Up next, as it is about the song.
	 *
	 * @since 5.9.0
	 */
	public static function view(): void {
		Registry::register_view(
			self::VIEW,
			array(
				'label'  => __( 'About', 'riff' ),
				'icon'   => 'info',
				'order'  => 36,
				'place'  => 'side',
				'render' => array( self::class, 'render' ),
			)
		);
	}

	/**
	 * The sections, in their order, each with its heading.
	 *
	 * @since 5.9.0
	 *
	 * @return array[] By id, each `label` and `order`, and `render` where it has one.
	 */
	public static function sections(): array {
		$own = array(
			'track'   => array(
				'label' => '',
				'order' => 10,
			),
			'credits' => array(
				'label' => __( 'Credits', 'riff' ),
				'order' => 20,
			),
		);
		/**
		 * Filters the sections of the About panel, Riff's own included: `track`, the cover, the
		 * title and the artist and album, and `credits`, what the file's tags say about who made it.
		 *
		 * Each section is drawn into the panel, hidden, as `[data-riff-about="<id>"]`, with its
		 * heading and an empty `.riff-about-body`. Its script fills the body and shows the section
		 * on the `riff.view` action, when its `id` is `about`; a section with nothing to say for the
		 * track playing stays hidden.
		 *
		 * @since 5.9.0
		 *
		 * @param array[] $sections By id (lowercase letters, digits and dashes), each with a `label`,
		 *                          its heading, or empty for none; an `order`, lowest first; and an
		 *                          optional `render`, a callable given the id that returns the body's
		 *                          markup as the page is drawn.
		 */
		$sections = apply_filters( 'riff_about_sections', $own );
		$kept     = array();
		$added    = 0;
		foreach ( is_array( $sections ) ? $sections : array() as $id => $section ) {
			if ( ! is_string( $id ) || ! preg_match( self::ID, $id ) || ! is_array( $section ) ) {
				continue;
			}
			$kept[ $id ] = array(
				'label'  => (string) ( $section['label'] ?? '' ),
				'order'  => (int) ( $section['order'] ?? 50 ),
				'render' => isset( $section['render'] ) && is_callable( $section['render'] ) ? $section['render'] : null,
				'added'  => $added++,
			);
		}
		uasort( $kept, static fn( $a, $b ) => array( $a['order'], $a['added'] ) <=> array( $b['order'], $b['added'] ) );
		return array_map(
			static function ( $section ) {
				unset( $section['added'] );
				return $section;
			},
			$kept
		);
	}

	/**
	 * The panel's markup: each section hidden until its script has something for the track.
	 *
	 * @since 5.9.0
	 *
	 * @return string
	 */
	public static function render(): string {
		$html = '';
		foreach ( self::sections() as $id => $section ) {
			$html .= sprintf(
				'<div class="riff-about-part riff-about-%1$s" data-riff-about="%1$s" hidden>%2$s<div class="riff-about-body">%3$s</div></div>',
				esc_attr( $id ),
				'' !== $section['label'] ? '<h3 class="riff-about-heading">' . esc_html( $section['label'] ) . '</h3>' : '',
				$section['render'] ? (string) call_user_func( $section['render'], $id ) : ''
			);
		}
		// The deck's icon, for the button over the cover that offers it (assets/player/about.js).
		$html .= '<template class="riff-about-deck-icon">' . Player::icon( 'record' ) . '</template>';
		return '<div class="riff-about">' . $html . '</div>';
	}

	/**
	 * What the panel's script needs: where the media route is, for a file's tags, and where an
	 * album's or an artist's page is, in the site's Listen page.
	 *
	 * @since 5.9.0
	 *
	 * @param array $data The player's data.
	 * @return array
	 */
	public static function player_data( $data ) {
		if ( ! is_array( $data ) || ! isset( Registry::views( 'side' )[ self::VIEW ] ) ) {
			return $data;
		}
		$data['about'] = array(
			'media'   => esc_url_raw( rest_url( 'wp/v2/media/' ) ),
			// Where the albums and artists a file is filed under are named.
			'catalog' => esc_url_raw( rest_url( 'riff/v1/' ) ),
			// On a Listen page the app's own page is the one, and the script reads it there.
			'listen'  => Player::listen_page() ? '' : self::listen(),
			'album'   => Listen\Browse::ALBUM,
			'artist'  => Listen\Browse::ARTIST,
		);
		// The panel open for a listener who has never chosen one.
		if ( self::opens() ) {
			$data['panel'] = self::VIEW;
		}
		return $data;
	}

	/**
	 * The site's Listen page, where an album's and an artist's pages are, or empty when it has none.
	 * Looked for once and kept until a page changes, as every page with the player asks.
	 *
	 * @since 5.9.0
	 *
	 * @return string
	 */
	public static function listen(): string {
		$id = get_transient( self::LISTEN );
		if ( false === $id ) {
			$id = Listen\First_Run::listen_page();
			set_transient( self::LISTEN, (string) $id, DAY_IN_SECONDS );
		}
		$id = (int) $id;
		return $id ? (string) get_permalink( $id ) : '';
	}

	/**
	 * Forgets the Listen page once a page changes, for the next request to look again.
	 *
	 * @since 5.9.0
	 *
	 * @param int      $post_id The post.
	 * @param \WP_Post $post    The post.
	 */
	public static function forget( $post_id, $post = null ): void {
		unset( $post_id );
		if ( $post instanceof \WP_Post && 'page' === $post->post_type ) {
			delete_transient( self::LISTEN );
		}
	}
}
