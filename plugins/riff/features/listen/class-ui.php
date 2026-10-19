<?php
/**
 * The Listen block's small shared pieces: a card, a row of cards, a heading, Play and Shuffle, a
 * heart, a group of chips and an empty note. Each has one renderer here and one block in riff.css.
 *
 * @since 4.20.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Player;

defined( 'ABSPATH' ) || exit;

/**
 * Shared components.
 *
 * Every view draws its pieces through these, and app.js draws the cards it adds (Load more,
 * Recently played, Jump back in) from the card template printed once in the block, so a card
 * looks the same however it arrived.
 */
final class Ui {

	/**
	 * The play icon on a card's cover.
	 */
	private const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

	/**
	 * A card: a square cover with a play button on it, a title that links, and a line under it.
	 * The link and the button sit side by side, never one inside the other.
	 *
	 * @since 4.20.0
	 *
	 * @param array $card {
	 *     The card.
	 *
	 *     @type string $title Title.
	 *     @type string $href  Where the title links, or empty for plain text.
	 *     @type string $sub   The line under the title.
	 *     @type string $art    The cover's address, or empty.
	 *     @type array  $covers Up to four covers for a playlist's mosaic, used when there is no art.
	 *     @type string $mark  A letter to show in place of a cover, or empty.
	 *     @type bool   $heart Whether the cover is Liked songs' heart.
	 *     @type string $class More classes: riff-card-artist for a round cover, riff-card-liked.
	 *     @type array  $data  data-riff-* attributes for the card, by name without the prefix.
	 *     @type string $id    An id for the card, or empty.
	 *     @type array  $play  The play button: action, label, and data, or empty for none.
	 * }
	 * @return string
	 */
	public static function card( array $card ): string {
		$card += array(
			'title'  => '',
			'href'   => '',
			'sub'    => '',
			'art'    => '',
			'covers' => array(),
			'mark'   => '',
			'heart'  => false,
			'class'  => '',
			'data'   => array(),
			'id'     => '',
			'play'   => array(),
		);
		$cover = '';
		if ( '' !== $card['art'] ) {
			$cover = '<img src="' . esc_url( $card['art'] ) . '" alt="" loading="lazy" decoding="async">';
		} elseif ( $card['covers'] ) {
			$cover = self::mosaic( (array) $card['covers'] );
		} elseif ( $card['heart'] ) {
			$cover = '<span class="riff-card-heart">' . Player::icon( 'hearted' ) . '</span>';
		} elseif ( '' !== $card['mark'] ) {
			$cover = '<span class="riff-card-mark" aria-hidden="true">' . esc_html( $card['mark'] ) . '</span>';
		}
		if ( $card['play'] ) {
			$cover .= sprintf(
				'<button type="button" class="riff-card-play" data-riff-app-action="%s"%s aria-label="%s">%s</button>',
				esc_attr( (string) $card['play']['action'] ),
				self::data( (array) ( $card['play']['data'] ?? array() ) ),
				esc_attr( (string) $card['play']['label'] ),
				self::PLAY
			);
		}
		$title = '<span class="riff-card-title">' . esc_html( $card['title'] ) . '</span>';
		return sprintf(
			'<div class="%s"%s%s><span class="riff-card-art">%s</span>%s<span class="riff-card-sub">%s</span></div>',
			esc_attr( trim( 'riff-card ' . $card['class'] ) ),
			'' !== $card['id'] ? ' id="' . esc_attr( $card['id'] ) . '"' : '',
			self::data( $card['data'] ),
			$cover,
			'' !== $card['href'] ? '<a class="riff-card-link" href="' . esc_url( $card['href'] ) . '">' . $title . '</a>' : $title,
			esc_html( $card['sub'] )
		);
	}

	/**
	 * A playlist's cover, as the apps draw one: the first four covers in a square of four, or the
	 * first one alone when there are fewer.
	 *
	 * @since 4.20.0
	 *
	 * @param string[] $covers Cover addresses, in the playlist's order.
	 * @return string
	 */
	public static function mosaic( array $covers ): string {
		$covers = array_values( array_filter( array_map( 'strval', $covers ) ) );
		if ( ! $covers ) {
			return '';
		}
		$img = static fn( string $src ): string => '<img src="' . esc_url( $src ) . '" alt="" loading="lazy" decoding="async">';
		if ( count( $covers ) < 4 ) {
			return $img( $covers[0] );
		}
		return '<span class="riff-mosaic">' . implode( '', array_map( $img, array_slice( $covers, 0, 4 ) ) ) . '</span>';
	}

	/**
	 * The card app.js fills in for a card it adds: every part present, for it to fill or remove.
	 *
	 * @since 4.20.0
	 *
	 * @return string A template element.
	 */
	public static function card_template(): string {
		return '<template data-riff-card-template>' . self::card(
			array(
				'href'  => '#',
				'class' => 'riff-card-template',
				'art'   => '#',
				'play'  => array(
					'action' => '',
					'label'  => '',
				),
			)
		) . '</template>';
	}

	/**
	 * A row of cards, as Home's: a heading, a Show all link, and the cards, which scroll sideways.
	 *
	 * @since 4.18.0
	 * @since 4.20.0 Shared by Home, Your Library and an artist's page.
	 * @since 4.21.0 The $data parameter.
	 *
	 * @param string $slug   The row's name, for the script and the styles.
	 * @param string $title  Heading.
	 * @param string $all    Show all's address, or empty for none.
	 * @param string $items  The row's items.
	 * @param bool   $device Whether the script fills it from the player; hidden until it does.
	 * @param string $tag    The row's element: div for cards, ul for list items.
	 * @param array  $data   More data-riff-* attributes for the row, by name without the prefix.
	 * @return string
	 */
	public static function shelf( string $slug, string $title, string $all, string $items, bool $device = false, string $tag = 'div', array $data = array() ): string {
		$id = 'riff-shelf-' . $slug;
		return sprintf(
			'<section class="riff-shelf" data-riff-shelf="%1$s"' . self::data( $data ) . ' aria-labelledby="%2$s"%3$s><div class="riff-shelf-head"><h3 class="riff-shelf-title" id="%2$s">%4$s</h3>%5$s</div><%6$s class="riff-shelf-row" tabindex="0" aria-labelledby="%2$s">%7$s</%6$s></section>',
			esc_attr( $slug ),
			esc_attr( $id ),
			$device ? ' hidden' : '',
			esc_html( $title ),
			'' !== $all ? '<a class="riff-shelf-all" href="' . esc_url( $all ) . '">' . esc_html__( 'Show all', 'riff' ) . '</a>' : '',
			'ul' === $tag ? 'ul' : 'div',
			$items
		);
	}

	/**
	 * A view's heading, focusable so the script can move focus to a new view.
	 *
	 * @since 4.20.0
	 *
	 * @param string $text Heading.
	 * @return string
	 */
	public static function title( string $text ): string {
		return '<h2 class="riff-app-title" tabindex="-1">' . esc_html( $text ) . '</h2>';
	}

	/**
	 * Play and Shuffle for the tracks the view holds, and a heart when there is one.
	 *
	 * @since 4.20.0
	 *
	 * @param string $heart A heart from heart(), or empty.
	 * @return string
	 */
	public static function actions( string $heart = '' ): string {
		return sprintf(
			'<p class="riff-album-actions"><button type="button" class="riff-pill riff-pill-solid" data-riff-app-action="play">%s</button><button type="button" class="riff-pill" data-riff-app-action="shuffle">%s</button>%s</p>',
			esc_html__( 'Play', 'riff' ),
			esc_html__( 'Shuffle', 'riff' ),
			$heart
		);
	}

	/**
	 * A heart for an album or an artist. app.js presses it from the listener's likes, and shows it
	 * once it can.
	 *
	 * @since 4.20.0
	 *
	 * @param string $kind album or artist.
	 * @param int    $id   Term ID.
	 * @param string $name Its name, for the label.
	 * @return string
	 */
	public static function heart( string $kind, int $id, string $name ): string {
		return sprintf(
			'<button type="button" class="riff-app-like" data-riff-app-action="like" data-riff-like-kind="%1$s" data-riff-like-id="%2$d" aria-pressed="false" aria-label="%3$s">%4$s</button>',
			esc_attr( $kind ),
			$id,
			/* translators: %s: an album or artist. */
			esc_attr( sprintf( __( 'Like %s', 'riff' ), $name ) ),
			Player::hearts()
		);
	}

	/**
	 * Links that pick one of a few: Your Library's chips, or its sort.
	 *
	 * @since 4.20.0
	 *
	 * @param string  $label   What the group picks, said to a screen reader and, for a sort, shown.
	 * @param array[] $choices Each with href, label and whether it is current.
	 * @param string  $kind    chips or sort.
	 * @return string
	 */
	public static function choices( string $label, array $choices, string $kind = 'chips' ): string {
		$links = '';
		foreach ( $choices as $choice ) {
			$links .= sprintf(
				'<a class="%s" href="%s"%s>%s</a>',
				'sort' === $kind ? 'riff-sort-link' : 'riff-chip-link',
				esc_url( (string) $choice['href'] ),
				! empty( $choice['current'] ) ? ' aria-current="true"' : '',
				esc_html( (string) $choice['label'] )
			);
		}
		if ( 'sort' === $kind ) {
			return sprintf( '<div class="riff-library-sort" role="group" aria-labelledby="riff-library-sort"><span id="riff-library-sort">%s</span>%s</div>', esc_html( $label ), $links );
		}
		return sprintf( '<div class="riff-chip-row" role="group" aria-label="%s">%s</div>', esc_attr( $label ), $links );
	}

	/**
	 * What an empty list says.
	 *
	 * @since 4.20.0
	 * @since 4.21.0 A link after the note.
	 *
	 * @param string $text  The note.
	 * @param string $href  Where the link after it goes, or empty for no link.
	 * @param string $label The link's text.
	 * @return string
	 */
	public static function empty_note( string $text, string $href = '', string $label = '' ): string {
		$link = '' !== $href && '' !== $label ? ' <a href="' . esc_url( $href ) . '">' . esc_html( $label ) . '</a>' : '';
		return '<p class="riff-app-empty">' . esc_html( $text ) . $link . '</p>';
	}

	/**
	 * The data-riff-* attributes.
	 *
	 * @param array $data Values by name, without the prefix.
	 * @return string
	 */
	private static function data( array $data ): string {
		$out = '';
		foreach ( $data as $name => $value ) {
			$out .= ' data-riff-' . sanitize_key( (string) $name ) . '="' . esc_attr( (string) $value ) . '"';
		}
		return $out;
	}
}
