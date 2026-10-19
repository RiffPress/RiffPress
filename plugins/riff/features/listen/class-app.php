<?php
/**
 * The app: a block, with a shortcode alias, that turns the page it sits on into the place to listen.
 *
 * @since 4.0.0
 * @package Riff
 */

namespace Riff\Listen;

use WP_Post;

use Riff\Library;
use Riff\Player;
use Riff\Tracks;

defined( 'ABSPATH' ) || exit;

/**
 * The listening page.
 *
 * The page holding the block is the route, the way a shop plugin's shop page is. Inside it the
 * library and every post open without leaving the page, so the music never stops. The server
 * renders the first view, so the page reads without the script and search engines see the posts.
 * A post is addressed by ?riff={id} or ?riff={slug} on the same page, and the library through its
 * Nth page by ?riff_page={N}.
 */
final class App {

	/**
	 * The page template that is the block and nothing else, for a page that should be all player.
	 * Registered on block themes (WordPress 6.7 and newer); a page picks it under Template, which
	 * stores the slug, "listen", in its page template meta.
	 *
	 * @since 4.0.0
	 */
	public const TEMPLATE = 'riff//listen';

	/**
	 * The query argument that opens a post inside the app.
	 *
	 * @since 4.0.0
	 */
	public const QUERY = 'riff';

	/**
	 * The query argument that shows the library through a later page.
	 *
	 * @since 4.13.0
	 */
	public const PAGE_QUERY = 'riff_page';

	/**
	 * Hooks the block and the shortcode.
	 *
	 * @since 4.0.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'init' ) );
	}

	/**
	 * Registers the block from its folder and the shortcode.
	 *
	 * @since 4.0.0
	 */
	public static function init(): void {
		register_block_type( RIFF_DIR . 'features/listen/block' );
		wp_set_script_translations( 'riff-app-editor-script', 'riff' );
		add_shortcode( 'riff', array( self::class, 'shortcode' ) );
		add_filter( 'riff_library_item', array( self::class, 'item_meta' ), 10, 2 );
		if ( function_exists( 'register_block_template' ) ) {
			register_block_template(
				self::TEMPLATE,
				array(
					'title'       => __( 'Listen', 'riff' ),
					'description' => __( 'The Riff block and nothing else: no header, no footer, the whole page is the player.', 'riff' ),
					'post_types'  => array( 'page' ),
					'content'     => '<!-- wp:riff/app {"align":"full"} /-->',
				)
			);
		}
	}

	/**
	 * [riff], the same as the block.
	 *
	 * @since 4.0.0
	 * @return string
	 */
	public static function shortcode(): string {
		return self::render();
	}

	/**
	 * The app's markup, with the first view rendered on the server.
	 *
	 * @since 4.0.0
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public static function render( array $attributes = array() ): string {
		if ( ! Player::enabled() ) {
			return '';
		}
		// In standalone mode every link stays under app/, so the player never drops back into the theme.
		$page   = Standalone::active() ? Standalone::url() : (string) get_permalink();
		$post   = self::requested();
		$browse = $post ? null : Browse::requested();
		if ( $post ) {
			$view = self::post_view( $post, $page );
		} elseif ( $browse ) {
			$view = Browse::view( $browse, $page );
		} else {
			$view = Browse::home_view( $page );
		}
		$align = isset( $attributes['align'] ) && in_array( $attributes['align'], array( 'wide', 'full' ), true ) ? ' align' . $attributes['align'] : '';
		// Inside a block render the wrapper carries the block's supports (colours, type); the
		// shortcode has no block, so it gets the plain class. On a theme that sets its colours the
		// stylesheet mixes the quieter shades from them, under riff-app-themed.
		$tokens  = self::theme_tokens( \WP_Block_Supports::$block_to_render ? $attributes : array() );
		$class   = 'riff-app' . ( isset( $tokens['--riff-app-bg'] ) || isset( $tokens['--riff-app-ink'] ) ? ' riff-app-themed' : '' );
		$style   = self::theme_style( $tokens );
		$wrapper = \WP_Block_Supports::$block_to_render
			? get_block_wrapper_attributes(
				array_filter(
					array(
						'class' => $class,
						'style' => $style,
					)
				)
			)
			: 'class="' . esc_attr( $class . $align ) . '"' . ( $style ? ' style="' . esc_attr( $style ) . '"' : '' );
		return sprintf(
			'<div %s data-riff-app data-riff-rest="%s" data-riff-tracks-rest="%s" data-riff-page="%s" data-riff-query="%s" data-riff-page-query="%s" data-riff-browse="%s">' .
			'<nav class="riff-app-bar" aria-label="%s">%s</nav>' .
			'<div class="riff-app-view" data-riff-app-view>%s</div></div>',
			$wrapper,
			esc_url( rest_url( Library::REST . '/library' ) ),
			esc_url( rest_url( Library::REST . '/tracks' ) ),
			esc_url( $page ),
			esc_attr( self::QUERY ),
			esc_attr( self::PAGE_QUERY ),
			esc_attr( implode( ',', Browse::ARGS ) ),
			esc_attr__( 'Riff', 'riff' ),
			Browse::nav( $page, $browse ),
			$view
		);
	}

	/**
	 * The theme's colours and fonts, as the block's custom properties.
	 *
	 * A theme with a theme.json has its background, text, link colour and fonts in global
	 * styles; the block takes those, so it reads as part of the site. Styles > Blocks > Riff in the
	 * Site Editor comes before the site's own, and what is set on this one block before both. A
	 * theme without a theme.json keeps the block's own WordPress.org palette, unless the block
	 * itself is given colours or a font.
	 *
	 * Every view inside the block is drawn from these properties, so the block's colour and font
	 * settings are read here rather than printed on its wrapper (block.json skips their
	 * serialization): the shades of its rows and cards follow the colour chosen.
	 *
	 * @since 4.14.0
	 * @since 4.18.0 Styles > Blocks > Riff, and the block's own colour and font settings.
	 *
	 * @param array $attributes The block's attributes, when it is a block.
	 * @return array<string, string> Custom property values, keyed by name.
	 */
	public static function theme_tokens( array $attributes = array() ): array {
		$tokens = array();
		if ( wp_theme_has_theme_json() ) {
			$styles = array(
				'--riff-app-bg'           => array( 'color', 'background' ),
				'--riff-app-ink'          => array( 'color', 'text' ),
				'--riff-app-accent'       => array( 'elements', 'link', 'color', 'text' ),
				'--riff-app-font'         => array( 'typography', 'fontFamily' ),
				'--riff-app-heading-font' => array( 'elements', 'heading', 'typography', 'fontFamily' ),
			);
			foreach ( $styles as $token => $path ) {
				$value = wp_get_global_styles( $path, array( 'block_name' => 'riff/app' ) );
				$value = is_string( $value ) && '' !== $value ? $value : wp_get_global_styles( $path );
				if ( is_string( $value ) && '' !== $value ) {
					$tokens[ $token ] = $value;
				}
			}
		}
		$tokens = array_merge( $tokens, self::block_tokens( $attributes ) );
		if ( $tokens ) {
			// A link drawn in the text's own colour (Twenty Twenty-Five's is currentColor) is the
			// text colour: currentColor in a custom property resolves on the element using it, and
			// a filled button's would be its own label.
			if ( isset( $tokens['--riff-app-accent'], $tokens['--riff-app-ink'] ) && in_array( strtolower( $tokens['--riff-app-accent'] ), array( 'currentcolor', 'inherit' ), true ) ) {
				$tokens['--riff-app-accent'] = 'var(--riff-app-ink)';
			}
			// A theme that sets one font sets it for its headings too.
			if ( isset( $tokens['--riff-app-font'] ) && ! isset( $tokens['--riff-app-heading-font'] ) ) {
				$tokens['--riff-app-heading-font'] = 'var(--riff-app-font)';
			}
		}
		/**
		 * Filters the custom properties the Riff block takes from the theme.
		 *
		 * Return an empty array to keep the block's own WordPress.org palette and fonts on
		 * every theme, or set any `--riff-app-*` property to a CSS value. With
		 * `--riff-app-bg` or `--riff-app-ink` set, the stylesheet mixes the secondary text,
		 * borders, surfaces and the accent's shades from them.
		 *
		 * @since 4.14.0
		 *
		 * @since 4.18.0 Includes Styles > Blocks > Riff and the block's own colour and font settings.
		 *
		 * @param array $tokens Custom property values from the theme's global styles, keyed by name.
		 */
		$tokens = (array) apply_filters( 'riff_app_theme_tokens', $tokens );
		return array_filter(
			$tokens,
			// A custom property name, and a value that cannot close the declaration or the attribute.
			static fn( $value, $token ): bool => is_string( $value ) && preg_match( '/^--riff-app-[a-z0-9-]+$/', (string) $token ) && preg_match( '/^[#a-z0-9(),.%\s"\'_-]+$/i', $value ),
			ARRAY_FILTER_USE_BOTH
		);
	}

	/**
	 * The colours and font set on one Riff block, as the block's custom properties: a preset by
	 * its slug, or a custom value.
	 *
	 * @since 4.18.0
	 *
	 * @param array $attributes Block attributes.
	 * @return array<string, string>
	 */
	private static function block_tokens( array $attributes ): array {
		$style  = (array) ( $attributes['style'] ?? array() );
		$preset = static fn( string $kind, $slug ): string => is_string( $slug ) && '' !== $slug ? 'var(--wp--preset--' . $kind . '--' . sanitize_key( $slug ) . ')' : '';
		$tokens = array(
			'--riff-app-bg'     => $preset( 'color', $attributes['backgroundColor'] ?? '' ),
			'--riff-app-ink'    => $preset( 'color', $attributes['textColor'] ?? '' ),
			'--riff-app-accent' => '',
			'--riff-app-font'   => $preset( 'font-family', $attributes['fontFamily'] ?? '' ),
		);
		$custom = array(
			'--riff-app-bg'     => $style['color']['background'] ?? '',
			'--riff-app-ink'    => $style['color']['text'] ?? '',
			'--riff-app-accent' => $style['elements']['link']['color']['text'] ?? '',
		);
		foreach ( $custom as $token => $value ) {
			if ( '' === $tokens[ $token ] && is_string( $value ) && '' !== $value ) {
				// A preset picked in the editor is stored as var:preset|color|slug.
				$tokens[ $token ] = preg_match( '/^var:preset\|([a-z0-9-]+)\|([a-z0-9-]+)$/', $value, $m ) ? $preset( $m[1], $m[2] ) : $value;
			}
		}
		// A font chosen for this block is its headings' font too.
		if ( '' !== $tokens['--riff-app-font'] ) {
			$tokens['--riff-app-heading-font'] = 'var(--riff-app-font)';
		}
		return array_filter( $tokens );
	}

	/**
	 * The block's custom properties as a style attribute's declarations, kept to what WordPress
	 * lets through a block's style attribute, so the block and the shortcode agree.
	 *
	 * @since 4.14.0
	 *
	 * @param array|null $tokens Custom property values keyed by name; the theme's when null.
	 * @return string CSS declarations, or an empty string.
	 */
	public static function theme_style( ?array $tokens = null ): string {
		$css = '';
		foreach ( $tokens ?? self::theme_tokens() as $token => $value ) {
			$css .= $token . ':' . $value . ';';
		}
		return '' === $css ? '' : (string) safecss_filter_attr( $css );
	}

	/**
	 * The post the address opens, when there is one that can be played.
	 *
	 * @since 4.0.0
	 * @return WP_Post|null
	 */
	private static function requested(): ?WP_Post {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which post to show; nothing changes.
		$raw = isset( $_GET[ self::QUERY ] ) ? sanitize_text_field( wp_unslash( $_GET[ self::QUERY ] ) ) : '';
		if ( '' === $raw ) {
			return null;
		}
		// An ID, or a post's slug: ?riff=compositions reads as well as ?riff=12, for links written by hand.
		$post = ctype_digit( $raw ) ? get_post( (int) $raw ) : get_page_by_path( $raw, OBJECT, 'post' );
		if ( ! $post instanceof WP_Post || ! is_post_publicly_viewable( $post ) || post_password_required( $post ) ) {
			return null;
		}
		return $post;
	}

	/**
	 * How many pages of the library the address asks for: 1 unless ?riff_page says more.
	 *
	 * @return int
	 */
	private static function requested_pages(): int {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- which page to show; nothing changes.
		$raw = isset( $_GET[ self::PAGE_QUERY ] ) ? sanitize_text_field( wp_unslash( $_GET[ self::PAGE_QUERY ] ) ) : '';
		return ctype_digit( $raw ) ? max( 1, (int) $raw ) : 1;
	}

	/**
	 * The address of a post inside the app.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $page    The app page's address.
	 * @return string
	 */
	public static function link( int $post_id, string $page ): string {
		return add_query_arg( self::QUERY, $post_id, $page );
	}

	/**
	 * Posts: a grid of the posts with tracks, through the page the address asks for.
	 *
	 * Each page is the same page the REST route returns, one after another, so the grid holds what
	 * pressing Load more that many times would have. Load more is a link to one page further, and
	 * works without the script; with it, app.js adds the next page in place.
	 *
	 * @since 4.0.0
	 * @since 4.13.0 Shows the pages ?riff_page asks for, with a Load more link while there are more.
	 * @since 4.18.0 Its own view, at riff_view=posts, now that Home opens the page.
	 *
	 * @param string $page The app page's address.
	 * @return string
	 */
	public static function posts_view( string $page ): string {
		$query = Library::query();
		if ( ! $query->posts ) {
			return '<p class="riff-app-empty">' . esc_html__( 'Nothing to play yet. Add an audio or video block to a post.', 'riff' ) . '</p>';
		}
		$pages = max( 1, (int) $query->max_num_pages );
		$upto  = min( self::requested_pages(), $pages );
		$cards = '';
		for ( $n = 1; $n <= $upto; $n++ ) {
			$posts = 1 === $n ? $query->posts : Library::query( array( 'paged' => $n ) )->posts;
			foreach ( array_values( $posts ) as $i => $post ) {
				$cards .= self::card( Library::item( $post ), $page, 0 === $i && $n > 1 ? $n : 0 );
			}
		}
		$more = '';
		if ( $upto < $pages ) {
			$more = sprintf(
				'<p class="riff-app-more"><a class="riff-pill" href="%s" data-riff-app-action="more">%s</a></p>',
				esc_url(
					add_query_arg(
						array(
							Browse::VIEW     => 'posts',
							self::PAGE_QUERY => $upto + 1,
						),
						$page
					) . '#riff-page-' . ( $upto + 1 )
				),
				esc_html__( 'Load more', 'riff' )
			);
		}
		return sprintf(
			'<h2 class="riff-app-title" tabindex="-1">%s</h2><div class="riff-grid" data-riff-page="%d" data-riff-pages="%d">%s</div>%s',
			esc_html__( 'Posts', 'riff' ),
			$upto,
			$pages,
			$cards,
			$more
		);
	}

	/**
	 * The newest posts with tracks as cards, for a row on Home.
	 *
	 * @since 4.18.0
	 *
	 * @param string $page The app page's address.
	 * @return string Cards, or empty when there are none.
	 */
	public static function post_cards( string $page ): string {
		$cards = '';
		foreach ( array_slice( Library::query()->posts, 0, 12 ) as $post ) {
			$cards .= self::card( Library::item( $post ), $page );
		}
		return $cards;
	}

	/**
	 * One post in the grid.
	 *
	 * @param array  $item  Library item.
	 * @param string $page  The app page's address.
	 * @param int    $first The page this card starts, for Load more's link to land on, or 0.
	 * @return string
	 */
	private static function card( array $item, string $page, int $first = 0 ): string {
		$art = $item['art'] ? end( $item['art'] )['src'] : '';
		// The same markup app.js writes in card(): a link and a play button side by side, never one
		// inside the other.
		return sprintf(
			'<div class="riff-card"%7$s data-riff-post="%1$d"><span class="riff-card-art">%2$s<button type="button" class="riff-card-play" data-riff-app-action="play-card" data-riff-post="%1$d" aria-label="%3$s"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span><a class="riff-card-link" href="%4$s"><span class="riff-card-title">%5$s</span></a><span class="riff-card-sub">%6$s</span></div>',
			(int) $item['id'],
			$art ? '<img src="' . esc_url( $art ) . '" alt="" loading="lazy" decoding="async">' : '',
			/* translators: %s: track or post title. */
			esc_attr( sprintf( __( 'Play %s', 'riff' ), $item['title'] ) ),
			esc_url( self::link( (int) $item['id'], $page ) ),
			esc_html( $item['title'] ),
			esc_html( $item['meta'] ?? self::meta( $item ) ),
			$first ? ' id="riff-page-' . $first . '"' : ''
		);
	}

	/**
	 * Writes the byline into a library item, so the app and the REST route carry it with the
	 * language's own plural forms instead of composing it in JavaScript.
	 *
	 * @since 4.0.0
	 *
	 * @param array    $item Library item.
	 * @param \WP_Post $post Its post.
	 * @return array
	 */
	public static function item_meta( $item, $post ) {
		unset( $post );
		if ( is_array( $item ) ) {
			$item['meta'] = self::meta( $item );
		}
		return $item;
	}

	/**
	 * A post opened: its title and byline beside Play and Shuffle, then its tracks, the blocks
	 * rendered as the post renders them.
	 *
	 * @param WP_Post $post Post.
	 * @param string  $page The app page's address.
	 * @return string
	 */
	private static function post_view( WP_Post $post, string $page ): string {
		$detail = Library::post( $post );
		if ( ! $detail['tracks'] ) {
			return Browse::home_view( $page );
		}
		$art = $detail['art'] ? end( $detail['art'] )['src'] : '';
		return self::header( $detail['title'], self::meta( $detail ), '', (string) $art, Art::tint( (array) $detail['art'] ) ) . sprintf(
			'<div class="riff-album-tracks" data-riff-numbered data-riff-tracks="%s">%s</div>',
			esc_attr( wp_json_encode( $detail['tracks'] ) ),
			$detail['html']
		);
	}

	/**
	 * The header of a list of tracks: the cover, what it is, its title and details, and Play and
	 * Shuffle under them, as the music apps draw an album.
	 *
	 * @since 4.17.0
	 * @since 4.20.0 A heart beside Play and Shuffle, for an album or artist.
	 *
	 * @param string $title Title.
	 * @param string $meta  The line under it.
	 * @param string $kind  What it is, above the title ("Album"), or empty.
	 * @param string $art   The cover's address, or empty for none.
	 * @param string $tint  A hex colour from the cover to tint the header with, or empty.
	 * @param bool   $round Whether the picture is round, as an artist's is.
	 * @param string $like  What the heart likes, "album" or "artist", or empty for no heart.
	 * @param int    $id    The album's or artist's term ID, for the heart.
	 * @return string
	 */
	public static function header( string $title, string $meta, string $kind = '', string $art = '', string $tint = '', bool $round = false, string $like = '', int $id = 0 ): string {
		$tint  = (string) sanitize_hex_color( $tint );
		$heart = '';
		if ( in_array( $like, array( 'album', 'artist' ), true ) && $id > 0 ) {
			// app.js presses it from the listener's likes, and shows it once it can.
			$heart = sprintf(
				'<button type="button" class="riff-app-like" data-riff-app-action="like" data-riff-like-kind="%1$s" data-riff-like-id="%2$d" aria-pressed="false" aria-label="%3$s">%4$s</button>',
				esc_attr( $like ),
				$id,
				/* translators: %s: an album or artist. */
				esc_attr( sprintf( __( 'Like %s', 'riff' ), $title ) ),
				Player::hearts()
			);
		}
		return sprintf(
			'<header class="riff-album%1$s"%8$s>%2$s<div class="riff-album-text">%3$s<h2 class="riff-album-title" tabindex="-1">%4$s</h2><p class="riff-album-meta">%5$s</p>' .
			'<p class="riff-album-actions"><button type="button" class="riff-pill riff-pill-solid" data-riff-app-action="play">%6$s</button><button type="button" class="riff-pill" data-riff-app-action="shuffle">%7$s</button>%9$s</p></div></header>',
			( '' !== $art ? ' riff-album-has-cover' : '' ) . ( '' !== $tint ? ' riff-album-tinted' : '' ) . ( $round ? ' riff-album-round' : '' ),
			'' !== $art ? '<span class="riff-album-cover"><img src="' . esc_url( $art ) . '" alt="" decoding="async"></span>' : '',
			'' !== $kind ? '<p class="riff-album-kind">' . esc_html( $kind ) . '</p>' : '',
			esc_html( $title ),
			esc_html( $meta ),
			esc_html__( 'Play', 'riff' ),
			esc_html__( 'Shuffle', 'riff' ),
			'' !== $tint ? ' style="--riff-album-tint:' . esc_attr( $tint ) . '"' : '',
			$heart // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped above; the icons are static SVG.
		);
	}

	/**
	 * "Artist · 10 tracks · 7 min", with the parts that are known.
	 *
	 * @param array $item Library item.
	 * @return string
	 */
	public static function meta( array $item ): string {
		$parts = array();
		if ( ! empty( $item['artist'] ) ) {
			$parts[] = $item['artist'];
		}
		/* translators: %s: number of tracks. */
		$parts[] = sprintf( _n( '%s track', '%s tracks', (int) $item['count'], 'riff' ), number_format_i18n( (int) $item['count'] ) );
		$minutes = (int) round( (float) $item['duration'] / 60 );
		if ( $minutes ) {
			/* translators: %s: number of minutes. */
			$parts[] = sprintf( _n( '%s min', '%s min', $minutes, 'riff' ), number_format_i18n( $minutes ) );
		}
		return implode( ' · ', $parts );
	}
}
