<?php
/**
 * Browsing the Media Library in the Listen block.
 *
 * @package Riff
 */

use Riff\Catalog;
use Riff\Listen\App;
use Riff\Listen\Browse;

/**
 * Riff\Listen\Browse.
 */
class Test_Riff_Browse extends Riff_TestCase {

	/**
	 * The Listen page.
	 *
	 * @var int
	 */
	private int $page = 0;

	public function set_up(): void {
		parent::set_up();
		$GLOBALS['wp_rest_server'] = null;
		Catalog::taxonomies();
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		self::attach( '02 - Underground [underground].mp3', $post );
		self::attach( '03 - Trombone Detritus [detritus].mp3', $post );
		$draft  = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$secret = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $draft );
		wp_update_attachment_metadata(
			$secret,
			array(
				'album'  => 'Secret Sessions',
				'artist' => 'Hidden Artist',
			)
		);
		$this->page = self::factory()->post->create(
			array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_content' => '<!-- wp:riff/app /-->',
			)
		);
	}

	public function tear_down(): void {
		wp_set_current_user( 0 );
		foreach ( Browse::ARGS as $key ) {
			unset( $_GET[ $key ] );
		}
		unset( $_GET[ App::PAGE_QUERY ] );
		parent::tear_down();
	}

	/**
	 * The block at an address, as a visitor.
	 *
	 * @param array $args Query arguments.
	 * @return string
	 */
	private function render_at( array $args ): string {
		$this->go_to( add_query_arg( $args, get_permalink( $this->page ) ) );
		foreach ( $args as $key => $value ) {
			$_GET[ $key ] = (string) $value; // go_to() does not fill $_GET; the block reads it.
		}
		return App::render();
	}

	/**
	 * The album's term ID.
	 *
	 * @param string $name Album name.
	 * @return int
	 */
	private function album( string $name ): int {
		return (int) get_term_by( 'name', $name, Catalog::ALBUM )->term_id;
	}

	public function test_an_empty_library_tells_only_someone_who_can_upload_how_to_fill_it(): void {
		// A Listen page made before any music, as the first-run button makes it: published, and on a
		// block theme already in the menu, so visitors reach it before the first upload.
		foreach ( get_posts(
			array(
				'post_type'      => 'attachment',
				'post_mime_type' => 'audio',
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => -1,
			)
		) as $id ) {
			wp_delete_attachment( $id, true );
		}

		foreach ( array( array(), array( Browse::VIEW => 'albums' ), array( Browse::VIEW => 'posts' ) ) as $args ) {
			$visitor = $this->render_at( $args );
			$where   = $args ? $args[ Browse::VIEW ] : 'home';
			$this->assertMatchesRegularExpression( '/Nothing (here|to play) yet\./', $visitor, $where );
			$this->assertStringNotContainsString( 'Media Library', $visitor, "$where: a visitor cannot upload" );
			$this->assertStringNotContainsString( 'wp riff import', $visitor, "$where: nor run WP-CLI" );
			$this->assertStringNotContainsString( 'audio or video block', $visitor, "$where: nor write a post" );
		}

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'author' ) ) );
		$author = $this->render_at( array() );
		$this->assertStringContainsString( 'Media Library', $author );
		$this->assertStringNotContainsString( 'wp riff import', $author, 'WP-CLI is for the guide, not the page' );
		$this->assertStringContainsString( 'Add your first album', $author );
	}

	public function test_the_bar_shows_who_is_listening(): void {
		// A visitor gets Sign in whether or not anyone may register: a site's own people sign in too.
		update_option( 'users_can_register', 0 );
		$this->assertMatchesRegularExpression( '#<a class="riff-pill riff-app-signin" href="[^"]*wp-login\.php[^"]*redirect_to=#', $this->render_at( array() ) );
		// And it comes back to the view it was pressed on.
		$album = $this->album( 'Compositions' );
		$this->assertMatchesRegularExpression( '#riff-app-signin" href="[^"]*redirect_to=[^"]*riff_album%3D' . $album . '#', $this->render_at( array( Browse::ALBUM => $album ) ) );

		wp_set_current_user(
			self::factory()->user->create(
				array(
					'role'         => 'subscriber',
					'display_name' => 'Ada Lovelace',
				)
			)
		);
		update_option( 'show_avatars', 1 );
		$asked = array();
		$reply = 200;
		$http  = static function ( $pre, $args, $url ) use ( &$asked, &$reply ) {
			unset( $pre, $args );
			$asked[] = $url;
			return array(
				'headers'  => array(),
				'body'     => '',
				'response' => array(
					'code'    => $reply,
					'message' => '',
				),
				'cookies'  => array(),
			);
		};
		add_filter( 'pre_http_request', $http, 10, 3 );
		$signed_in = $this->render_at( array() );
		$this->assertStringContainsString( '<details class="riff-app-account"><summary aria-label="Account: Ada Lovelace"><img class="riff-app-avatar"', $signed_in );
		$this->assertCount( 1, $asked, 'Gravatar is asked whether there is a face' );
		$this->assertStringContainsString( 'd=404', $asked[0] );
		$this->render_at( array() );
		$this->assertCount( 1, $asked, 'and the answer is kept' );
		$this->assertStringContainsString( '<p class="riff-app-account-name">Ada Lovelace</p>', $signed_in );
		$this->assertStringContainsString( 'profile.php', $signed_in, 'Edit profile' );
		$this->assertStringContainsString( 'action=logout', $signed_in, 'Sign out' );
		$this->assertStringNotContainsString( 'riff-app-signin', $signed_in );

		// Someone with no Gravatar gets their initial, not the grey silhouette.
		$reply = 404;
		wp_update_user(
			array(
				'ID'         => get_current_user_id(),
				'user_email' => 'no-face@example.org',
			)
		);
		$initial = '<span class="riff-app-avatar riff-app-initial" aria-hidden="true">A</span>';
		$this->assertStringContainsString( $initial, $this->render_at( array() ), 'the initial, where Gravatar has no face' );
		$this->assertCount( 2, $asked, 'a new email is asked about afresh' );

		// An avatar plugin's own picture is used as it is, and Gravatar is not asked.
		$local = static fn( array $args ): array => array_merge( $args, array( 'url' => 'https://example.org/ada.jpg' ) );
		add_filter( 'pre_get_avatar_data', $local );
		$this->assertStringContainsString( 'src="https://example.org/ada.jpg"', $this->render_at( array() ) );
		remove_filter( 'pre_get_avatar_data', $local );
		$this->assertCount( 2, $asked );
		remove_filter( 'pre_http_request', $http, 10 );

		update_option( 'show_avatars', 0 );
		$this->assertStringContainsString( $initial, $this->render_at( array() ), 'the initial, where the site shows no avatars' );
	}

	public function test_the_address_names_a_view_and_anything_else_is_not_one(): void {
		$this->go_to( get_permalink( $this->page ) );
		$this->assertNull( Browse::requested() );

		$_GET[ Browse::VIEW ] = 'albums';
		$this->assertSame( 'albums', Browse::requested()['view'] );
		$_GET[ Browse::VIEW ] = 'everything';
		$this->assertNull( Browse::requested(), 'only the three lists' );
		$_GET[ Browse::ALBUM ] = '12abc';
		$this->assertNull( Browse::requested(), 'an album is a number' );
		$_GET[ Browse::SEARCH ] = '  blue  ';
		$this->assertSame( 'blue', Browse::requested()['search'] );
	}

	public function test_the_search_tab_opens_search_with_the_lists_to_browse(): void {
		$_GET[ Browse::VIEW ] = 'search';
		$this->assertSame( array( 'search', '' ), array( Browse::requested()['view'], Browse::requested()['search'] ) );
		unset( $_GET[ Browse::VIEW ] );

		$html = $this->render_at( array( Browse::VIEW => 'search' ) );
		$this->assertStringContainsString( 'riff_view=search" aria-current="page"', $html );
		$this->assertStringContainsString( 'data-riff-view="search"', $html );
		$this->assertStringContainsString( '<h2 class="riff-app-title" tabindex="-1">Browse all</h2>', $html );
		$this->assertSame( 4, substr_count( $html, 'class="riff-browse-tile"' ) );
		$this->assertMatchesRegularExpression( '#class="riff-browse-tile" href="[^"]*riff_view=albums"#', $html );
	}

	public function test_the_navigation_marks_where_you_are_and_search_works_without_the_script(): void {
		$html = $this->render_at( array( Browse::VIEW => 'albums' ) );

		$this->assertMatchesRegularExpression( '#<a class="riff-app-tab" href="[^"]*riff_view=albums" aria-current="page"><svg[^>]*><path d="[^"]+"/></svg><span>Albums</span></a>#', $html );
		$this->assertStringContainsString( '<a class="riff-app-tab riff-app-home" href="' . esc_url( get_permalink( $this->page ) ) . '"><svg', $html, 'the library link the script and the tests know' );
		$this->assertStringContainsString( '<span class="riff-app-brand" data-riff-view="albums">', $html, 'the site\'s name, for the sidebar, with the view showing' );
		$this->assertMatchesRegularExpression( '#<a class="riff-app-tab riff-app-tab-search" href="[^"]*riff_view=search"><svg#', $html, 'Search, a tab on a phone' );
		$this->assertStringContainsString( 'role="search" action="' . esc_url( strtok( get_permalink( $this->page ), '?' ) ) . '" method="get"', $html );
		$this->assertStringContainsString( 'name="riff_search"', $html );
		$this->assertStringContainsString( 'data-riff-browse="riff_view,riff_album,riff_artist,riff_search,riff_filter,riff_sort,riff_playlist"', $html );
	}

	public function test_albums_show_only_what_a_visitor_may_see(): void {
		$html = $this->render_at( array( Browse::VIEW => 'albums' ) );

		$this->assertStringContainsString( 'data-riff-app-action="play-album" data-riff-album="' . $this->album( 'Compositions' ) . '"', $html );
		$this->assertStringContainsString( '<span class="riff-card-sub">The Airmen of Note</span>', $html );
		$this->assertStringNotContainsString( 'Secret Sessions', $html );
	}

	public function test_every_album_card_has_the_same_line_its_artist(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		foreach (
			array(
				'Celtic Aire'  => 'Celtic Aire, United States Air Force Band',
				'No One Wrote' => '',
			) as $album => $artist
		) {
			$id = self::attach( '04 - It\'s a Brand New Day [new-day].mp3', $post );
			wp_update_attachment_metadata(
				$id,
				array(
					'album'  => $album,
					'artist' => $artist,
				)
			);
		}

		$html = $this->render_at( array( Browse::VIEW => 'albums' ) );
		preg_match_all( '#<span class="riff-card-title">([^<]+)</span></a><span class="riff-card-sub">([^<]*)</span>#', $html, $cards );
		$lines = array_combine( $cards[1], $cards[2] );

		$this->assertSame(
			array(
				'Celtic Aire'  => 'Celtic Aire, United States Air Force Band',
				'Compositions' => 'The Airmen of Note',
				'No One Wrote' => 'Album',
			),
			$lines,
			'the artist and nothing more, whatever album it is, and Album when there is no artist'
		);
	}

	public function test_an_album_opens_as_rows_in_its_order_with_play_and_shuffle(): void {
		$html = $this->render_at( array( Browse::ALBUM => $this->album( 'Compositions' ) ) );

		$this->assertStringContainsString( '<h2 class="riff-album-title" tabindex="-1">Compositions</h2>', $html );
		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ), 'rows the player takes over' );
		$this->assertLessThan( strpos( $html, 'Trombone Detritus' ), strpos( $html, 'Underground' ), 'track 2 before track 3' );
		$this->assertStringContainsString( 'data-riff-more="', $html, 'Play and Shuffle play the album from its route' );
		$this->assertStringContainsString( 'data-riff-app-action="shuffle"', $html );
	}

	public function test_an_album_longer_than_a_page_runs_on_over_its_pages_numbered_on(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		foreach ( array_reverse( range( 1, 120 ) ) as $n ) {
			$id = wp_insert_attachment(
				array(
					'post_title'     => "Box track $n",
					'post_mime_type' => 'audio/mpeg',
					'post_status'    => 'inherit',
				),
				sprintf( 'box/%03d.mp3', $n ),
				$post
			);
			wp_update_attachment_metadata(
				$id,
				array(
					'title'        => "Box track $n",
					'album'        => 'Box Set',
					'artist'       => 'Someone',
					'track_number' => (string) $n,
				)
			);
		}

		$album = $this->album( 'Box Set' );
		$first = $this->render_at( array( Browse::ALBUM => $album ) );
		$rows  = static function ( string $html ): array {
			preg_match_all( '/data-riff-track="([^"]*)"/', $html, $found );
			return wp_list_pluck( array_map( static fn( $t ) => json_decode( html_entity_decode( $t ), true ), $found[1] ), 'title' );
		};

		$this->assertSame( array_map( static fn( $n ) => "Box track $n", range( 1, 100 ) ), $rows( $first ), 'the first hundred, in order' );
		$this->assertMatchesRegularExpression( '#<a class="riff-pill" href="[^"]*riff_album=' . $album . '[^"]*riff_page=2#', str_replace( '&#038;', '&', $first ), 'and a way on to the rest' );
		preg_match( '/data-riff-more="([^"]*)"/', $first, $found );
		$more = json_decode( html_entity_decode( $found[1] ?? '' ), true );
		$this->assertSame( array( 1, 2, 100 ), array( $more['page'], $more['pages'], $more['per_page'] ), 'where Play and Shuffle find the whole album' );
		$this->assertStringContainsString( 'album=' . $album, $more['url'] );

		$second = $this->render_at(
			array(
				Browse::ALBUM => $album,
				'riff_page'   => 2,
			)
		);
		unset( $_GET['riff_page'] );
		$this->assertSame( array_map( static fn( $n ) => "Box track $n", range( 101, 120 ) ), $rows( $second ) );
		$this->assertStringContainsString( 'data-riff-numbered style="counter-reset:riff-track 100"', $second, 'numbered on from 101' );
	}

	public function test_an_artist_page_has_their_picture_their_latest_tracks_and_their_albums(): void {
		$artist = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;

		$html = $this->render_at( array( Browse::ARTIST => $artist ) );

		$this->assertStringContainsString( 'riff-album-round', $html, 'a round picture, as the apps draw an artist' );
		$this->assertStringContainsString( '<p class="riff-album-kind">Artist</p>', $html );
		$this->assertStringContainsString( '>Latest</h3>', $html );
		$this->assertStringContainsString( '>Albums</h3>', $html );
		$this->assertStringContainsString( 'data-riff-album="' . $this->album( 'Compositions' ) . '"', $html, 'their albums' );
		$this->assertStringContainsString( '1 album', $html );

		// Their own picture, once they have one, before any album's cover.
		$file  = get_temp_dir() . 'riff-artist-' . wp_generate_password( 6, false ) . '.png';
		$image = imagecreatetruecolor( 32, 32 );
		imagepng( $image, $file );
		$picture = self::factory()->attachment->create_upload_object( $file );
		wp_delete_file( $file );
		update_term_meta( $artist, Catalog::ARTIST_IMAGE, $picture );
		$this->assertStringContainsString( (string) wp_get_attachment_url( $picture ), $this->render_at( array( Browse::ARTIST => $artist ) ) );
	}

	public function test_an_artist_without_a_picture_is_their_initial_not_a_drawn_cover_cut_round(): void {
		$artist = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;
		// No image anywhere, so their album's cover is one Riff draws.
		foreach ( get_objects_in_term( $artist, Catalog::ARTIST ) as $id ) {
			delete_post_thumbnail( (int) $id );
			delete_post_thumbnail( (int) get_post_field( 'post_parent', (int) $id ) );
		}

		preg_match( '#<header class="riff-album[^"]*".*?</header>#s', $this->render_at( array( Browse::ARTIST => $artist ) ), $head );

		$this->assertStringContainsString( '<span class="riff-album-mark" aria-hidden="true">A</span>', $head[0] ?? '', 'their initial, as on their card' );
		$this->assertStringNotContainsString( '<img', $head[0] ?? '', 'not the drawn cover, whose type the round frame cuts off' );
	}

	public function test_an_artist_page_shows_ten_tracks_at_a_time(): void {
		$artist = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;
		$post   = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		for ( $i = 0; $i < 10; $i++ ) {
			self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		}

		$html = $this->render_at( array( Browse::ARTIST => $artist ) );

		$this->assertSame( 10, substr_count( $html, '<figure data-riff-track=' ) );
		$this->assertStringContainsString( 'riff_page=2', $html, 'and a link to the rest' );
	}

	public function test_an_album_offers_more_by_its_artist_that_the_visitor_can_see(): void {
		$compositions = $this->album( 'Compositions' );
		$artist       = (string) get_term_meta( $compositions, 'riff_album_artist', true );
		$post         = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$encore       = self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		wp_update_attachment_metadata(
			$encore,
			array(
				'album'  => 'Encore',
				'artist' => $artist,
			)
		);
		$draft  = self::factory()->post->create( array( 'post_status' => 'draft' ) );
		$hidden = self::attach( '06 - Sunk in Dars [sunk-in-dars].mp3', $draft );
		wp_update_attachment_metadata(
			$hidden,
			array(
				'album'  => 'Unreleased',
				'artist' => $artist,
			)
		);

		$html = $this->render_at( array( Browse::ALBUM => $compositions ) );

		$this->assertStringContainsString( 'More by ' . esc_html( $artist ), $html );
		$this->assertStringContainsString( 'data-riff-album="' . $this->album( 'Encore' ) . '"', $html );
		$this->assertStringNotContainsString( 'Unreleased', $html, 'an album only on a draft is not offered' );
		$this->assertStringNotContainsString( 'data-riff-album="' . $compositions . '"', $html, 'the album showing is not offered again' );
		$this->assertStringContainsString( 'riff-album-tinted', $html, 'its header is tinted from its cover' );
	}

	public function test_an_album_names_its_artist_as_a_link_to_their_page(): void {
		$compositions = $this->album( 'Compositions' );
		$artist       = (string) get_term_meta( $compositions, 'riff_album_artist', true );
		$this->assertStringNotContainsString( '<p class="riff-album-meta"><a', $this->render_at( array( Browse::ALBUM => $compositions ) ), 'an artist with no page of their own is only named' );

		// A track by them files them as an artist, with a page.
		$post  = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$track = self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		wp_update_attachment_metadata(
			$track,
			array(
				'album'  => 'Encore',
				'artist' => $artist,
			)
		);
		$term = get_term_by( 'name', $artist, 'riff_artist' );
		$html = $this->render_at( array( Browse::ALBUM => $compositions ) );

		$this->assertMatchesRegularExpression( '#<p class="riff-album-meta"><a href="[^"]*riff_artist=' . $term->term_id . '">' . preg_quote( esc_html( $artist ), '#' ) . '</a> · #', $html );
	}

	public function test_an_album_leads_with_its_cover_and_numbers_its_tracks(): void {
		$html = $this->render_at( array( Browse::ALBUM => $this->album( 'Compositions' ) ) );

		$this->assertStringContainsString( '<header class="riff-album riff-album-has-cover riff-album-tinted" style="--riff-album-tint:#', $html );
		$this->assertStringContainsString( '<p class="riff-album-kind">Album</p>', $html );
		$this->assertMatchesRegularExpression( '#<span class="riff-album-cover"><img [^>]*sizes="\(max-width: 599px\) 66vw, 300px" alt="" fetchpriority="high"#', $html, 'the cover the page is painted around, first' );
		$this->assertStringContainsString( '<div class="riff-album-tracks" data-riff-numbered data-riff-more=', $html );
		$this->assertStringNotContainsString( 'data-riff-numbered', $this->render_at( array( Browse::VIEW => 'tracks' ) ), 'a list of everything shows each track\'s art' );
	}

	public function test_a_private_album_cannot_be_opened_by_its_number(): void {
		$html = $this->render_at( array( Browse::ALBUM => $this->album( 'Secret Sessions' ) ) );

		$this->assertStringNotContainsString( 'Brand New Day', $html );
		$this->assertStringContainsString( '>Albums</h2>', $html, 'it falls back to the albums list' );
	}

	public function test_artists_and_an_artist(): void {
		$list = $this->render_at( array( Browse::VIEW => 'artists' ) );
		$this->assertStringContainsString( 'Airmen of Note, United States Air Force Band', $list );
		$this->assertStringNotContainsString( 'Hidden Artist', $list );

		$id   = (int) get_term_by( 'name', 'Airmen of Note, United States Air Force Band', Catalog::ARTIST )->term_id;
		$html = $this->render_at( array( Browse::ARTIST => $id ) );
		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ) );
	}

	public function test_search_finds_albums_artists_and_tracks_or_says_nothing_matched(): void {
		$html = $this->render_at( array( Browse::SEARCH => 'compos' ) );
		$this->assertStringContainsString( 'Results for “compos”', $html );
		$this->assertStringContainsString( 'data-riff-album=', $html );
		$this->assertStringContainsString( 'data-riff-track=', $html );

		$none = $this->render_at( array( Browse::SEARCH => 'zzzz' ) );
		$this->assertStringContainsString( 'Nothing matches that.', $none );

		$hostile = $this->render_at( array( Browse::SEARCH => '<script>x</script>' ) );
		$this->assertStringNotContainsString( '<script>x', $hostile, 'the words are escaped' );
	}

	public function test_every_view_escapes_names_from_the_library(): void {
		$hostile = '"><img src=x onerror=riffxss>';
		$post    = self::factory()->post->create(
			array(
				'post_status' => 'publish',
				'post_title'  => 'Post ' . $hostile,
			)
		);
		$track   = self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		wp_update_post(
			array(
				'ID'         => $track,
				'post_title' => 'Track ' . $hostile,
			)
		);
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $track, esc_url( (string) wp_get_attachment_url( $track ) ) ),
			)
		);
		wp_update_attachment_metadata(
			$track,
			array(
				'album'  => 'Album ' . $hostile,
				'artist' => 'Artist ' . $hostile,
			)
		);
		// Filed under the whole names, brackets and all, so every view has them to escape.
		$artist = (int) wp_get_object_terms( $track, Catalog::ARTIST )[0]->term_id;
		$album  = (int) wp_get_object_terms( $track, Catalog::ALBUM )[0]->term_id;
		$views  = array(
			'home'    => array(),
			'albums'  => array( Browse::VIEW => 'albums' ),
			'artists' => array( Browse::VIEW => 'artists' ),
			'tracks'  => array( Browse::VIEW => 'tracks' ),
			'posts'   => array( Browse::VIEW => 'posts' ),
			'album'   => array( Browse::ALBUM => $album ),
			'artist'  => array( Browse::ARTIST => $artist ),
			'search'  => array( Browse::SEARCH => 'Track' ),
			'post'    => array( App::QUERY => $post ),
		);
		foreach ( $views as $name => $args ) {
			$html = $this->render_at( $args );
			$this->assertStringContainsString( 'riffxss', $html, "$name shows the names" );
			$this->assertStringNotContainsString( '<img src=x', $html, "$name escapes them" );
			foreach ( Browse::ARGS as $key ) {
				unset( $_GET[ $key ] );
			}
			unset( $_GET[ App::QUERY ] );
		}
	}

	public function test_tracks_list_every_visible_track(): void {
		$html = $this->render_at( array( Browse::VIEW => 'tracks' ) );

		$this->assertSame( 2, substr_count( $html, 'data-riff-track=' ) );
		$this->assertStringContainsString( '2 tracks', $html );
	}

	public function test_a_post_address_still_wins_over_a_browse_one(): void {
		$post = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$id   = self::attach( '05 - Stole Back My Soul [stole-back].mp3', $post );
		wp_update_post(
			array(
				'ID'           => $post,
				'post_content' => sprintf( '<!-- wp:audio {"id":%d} --><figure class="wp-block-audio"><audio controls src="%s"></audio></figure><!-- /wp:audio -->', $id, wp_get_attachment_url( $id ) ),
			)
		);

		$html = $this->render_at(
			array(
				App::QUERY   => $post,
				Browse::VIEW => 'albums',
			)
		);

		$this->assertStringContainsString( get_the_title( $post ), $html );
		$this->assertStringNotContainsString( '>Albums</h2>', $html );
	}
}
