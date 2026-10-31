<?php
/**
 * The Listen block's shared components.
 *
 * @package Riff
 */

use Riff\Listen\Ui;

/**
 * Riff\Listen\Ui.
 */
class Test_Riff_Ui extends Riff_TestCase {

	public function test_a_card_has_its_cover_play_button_link_and_line_in_one_order(): void {
		$html = Ui::card(
			array(
				'title' => 'Compositions <b>',
				'href'  => 'https://example.org/?riff_album=1',
				'sub'   => 'The Airmen of Note',
				'art'   => 'https://example.org/cover.jpg',
				'data'  => array( 'album' => 1 ),
				'id'    => 'riff-page-2',
				'play'  => array(
					'action' => 'play-album',
					'label'  => 'Play Compositions',
					'data'   => array( 'album' => 1 ),
				),
			)
		);

		$this->assertSame(
			'<div class="riff-card" id="riff-page-2" data-riff-album="1"><span class="riff-card-art"><img src="https://example.org/cover.jpg" sizes="(max-width: 599px) 45vw, 240px" alt="" loading="lazy" decoding="async"><button type="button" class="riff-card-play" data-riff-app-action="play-album" data-riff-album="1" aria-label="Play Compositions"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></span><a class="riff-card-link" href="https://example.org/?riff_album=1"><span class="riff-card-title">Compositions &lt;b&gt;</span></a><span class="riff-card-sub">The Airmen of Note</span></div>',
			$html
		);
	}

	public function test_a_card_without_a_cover_link_or_button_keeps_its_shape(): void {
		$letter = Ui::card(
			array(
				'title' => 'Airmen',
				'mark'  => 'A',
				'class' => 'riff-card-artist',
			)
		);
		$heart  = Ui::card(
			array(
				'title' => 'Liked songs',
				'heart' => true,
			)
		);

		$this->assertStringContainsString( '<span class="riff-card-art"><span class="riff-card-mark" aria-hidden="true">A</span></span><span class="riff-card-title">Airmen</span>', $letter, 'a letter for a cover, and the title as plain text' );
		$this->assertStringContainsString( 'class="riff-card riff-card-artist"', $letter );
		$this->assertStringContainsString( '<span class="riff-card-heart"><svg', $heart );
		$this->assertStringNotContainsString( 'riff-card-play', $heart );
	}

	public function test_the_card_template_has_every_part_for_the_script_to_fill_and_is_not_counted_as_a_card(): void {
		$html = Ui::card_template();

		$this->assertStringStartsWith( '<template data-riff-card-template><div class="riff-card riff-card-template">', $html );
		foreach ( array( '<img ', 'riff-card-play', 'riff-card-link', 'riff-card-title', 'riff-card-sub' ) as $part ) {
			$this->assertStringContainsString( $part, $html );
		}
		$this->assertStringNotContainsString( 'class="riff-card"', $html );
	}

	public function test_choices_mark_the_current_one_and_a_sort_shows_its_label(): void {
		$items = array(
			array(
				'label'   => 'All',
				'href'    => '#all',
				'current' => true,
			),
			array(
				'label' => 'Songs',
				'href'  => '#songs',
			),
		);

		$this->assertSame( '<div class="riff-chip-row" role="group" aria-label="Show"><a class="riff-chip-link" href="#all" aria-current="true">All</a><a class="riff-chip-link" href="#songs">Songs</a></div>', Ui::choices( 'Show', $items ) );
		$sort = Ui::choices( 'Sort by', $items, 'sort' );
		$this->assertStringContainsString( '<details class="riff-library-sort"><summary aria-label="Sort by: All">All<svg', $sort, 'the sort in use on its button, named with what it sorts' );
		$this->assertStringContainsString( '<a class="riff-sort-link" href="#all" aria-current="true">All</a><a class="riff-sort-link" href="#songs">Songs</a>', $sort );
	}

	public function test_a_heart_starts_unpressed_with_both_icons_and_a_label(): void {
		$html = Ui::heart( 'album', 7, 'Compositions' );

		$this->assertStringContainsString( 'data-riff-like-kind="album" data-riff-like-id="7" aria-pressed="false" aria-label="Like Compositions"', $html );
		$this->assertStringContainsString( 'class="riff-heart-off"', $html );
		$this->assertStringContainsString( 'class="riff-heart-on"', $html );
	}

	public function test_an_album_card_says_its_artist_and_nothing_more(): void {
		$album = array(
			'id'     => 3,
			'name'   => 'Compositions',
			'artist' => 'The Airmen of Note',
			'count'  => 10,
			'art'    => array( array( 'src' => 'https://example.org/cover.jpg' ) ),
		);
		$html  = Ui::album( $album, 'https://example.org/?riff_album=3' );

		$this->assertStringContainsString( '<span class="riff-card-sub">The Airmen of Note</span>', $html );
		$this->assertStringContainsString( 'data-riff-app-action="play-album" data-riff-album="3" aria-label="Play Compositions"', $html );
		$this->assertStringContainsString( '<img src="https://example.org/cover.jpg"', $html );
		$this->assertSame( 'Album', Ui::album_line( array( 'artist' => '  ' ) ), 'a line of the same height when there is no artist' );
	}

	public function test_a_cover_offers_every_size_for_the_browser_to_pick_by_how_wide_it_is_shown(): void {
		$art = array(
			array(
				'src'   => 'https://example.org/cover-150x150.jpg',
				'sizes' => '150x150',
			),
			array(
				'src'   => 'https://example.org/cover-768x768.jpg',
				'sizes' => '768x768',
			),
			array(
				'src'   => 'https://example.org/cover-1024x1024.jpg',
				'sizes' => '1024x1024',
			),
		);

		$this->assertSame(
			'<img src="https://example.org/cover-1024x1024.jpg" srcset="https://example.org/cover-150x150.jpg 150w, https://example.org/cover-768x768.jpg 768w, https://example.org/cover-1024x1024.jpg 1024w" sizes="(max-width: 599px) 45vw, 240px" alt="" loading="lazy" decoding="async">',
			Ui::image( $art, Ui::CARD_SIZES )
		);
		$drawn = Ui::image(
			array(
				array(
					'src'   => 'https://example.org/?riff-art=1',
					'sizes' => '1024x1024',
					'type'  => 'image/svg+xml',
				),
			),
			Ui::CARD_SIZES
		);
		$this->assertStringNotContainsString( 'srcset', $drawn, 'a drawn cover is one SVG, sharp at any size' );
		$this->assertSame( '', Ui::image( array(), Ui::CARD_SIZES ) );
	}

	public function test_the_first_row_loads_at_once_and_the_first_cover_before_anything_else(): void {
		$art = array( array( 'src' => 'https://example.org/cover.jpg' ) );

		Ui::lead( 2 );
		$first  = Ui::image( $art, Ui::CARD_SIZES );
		$second = Ui::image( $art, Ui::CARD_SIZES );
		$third  = Ui::image( $art, Ui::CARD_SIZES );

		$this->assertStringContainsString( 'fetchpriority="high"', $first );
		$this->assertStringNotContainsString( 'loading=', $first );
		$this->assertStringNotContainsString( 'fetchpriority', $second, 'the rest of the row at once, but not first' );
		$this->assertStringNotContainsString( 'loading=', $second );
		$this->assertStringContainsString( 'loading="lazy"', $third, 'and after the row, when scrolled to' );
	}
}
