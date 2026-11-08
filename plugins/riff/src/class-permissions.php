<?php
/**
 * Permissions: what each Riff plugin may do, in plain words, read from its isolation.json.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * Each Riff plugin, Riff's own extensions and any other plugin that requires Riff, says in its
 * isolation.json what it touches: the settings and data it keeps, the sites it may contact, the
 * programs it runs, the REST routes it adds, and the parts of Riff it uses (docs/isolation.md).
 * The repository's checks hold a plugin to its file. This turns the file into a list a site owner
 * can read, as a phone lists an app's permissions: on Settings › Riff for every active one, from a
 * link in each one's row on the Plugins screen, and in a notice once one is activated or turned on.
 *
 * The file is read as data, never trusted to be well formed: a part this doesn't know is listed as
 * it is written rather than left out, so a plugin never looks like it asks for less than it does.
 */
final class Permissions {

	/**
	 * The file a plugin keeps beside its main file.
	 */
	public const FILE = 'isolation.json';

	/**
	 * Where the plugins just activated wait for their notice, per user.
	 */
	private const PENDING = 'riff_permissions_pending';

	/**
	 * The anchor of a plugin's list on Settings › Riff.
	 */
	private const ANCHOR = 'riff-permissions-';

	/**
	 * Hooks the list, the Plugins screen's links and the notice.
	 *
	 * @since 6.5.0
	 */
	public static function register(): void {
		add_filter( 'plugin_row_meta', array( self::class, 'row_meta' ), 10, 2 );
		add_action( 'activated_plugin', array( self::class, 'activated' ) );
		add_action( 'update_option_' . Extensions::OPTION, array( self::class, 'turned_on' ), 10, 2 );
		add_action( 'admin_notices', array( self::class, 'notice' ) );
		add_action( 'network_admin_notices', array( self::class, 'notice' ) );
	}

	/**
	 * A plugin's isolation.json, decoded; null when it has none or it isn't a JSON object.
	 *
	 * @since 6.5.0
	 *
	 * @param string $dir The plugin's folder.
	 * @return array|null
	 */
	public static function manifest( string $dir ): ?array {
		$file = trailingslashit( $dir ) . self::FILE;
		if ( ! is_readable( $file ) ) {
			return null;
		}
		$json = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- a plugin's own file, on disk.
		return is_array( $json ) && ! array_is_list( $json ) ? $json : null;
	}

	/**
	 * What a manifest allows, each as a sentence and, where the manifest gives one, why.
	 *
	 * @since 6.5.0
	 *
	 * @param array $manifest A decoded isolation.json.
	 * @return array<int, array{ text: string, why: string }>
	 */
	public static function lines( array $manifest ): array {
		$lines = array();
		$add   = static function ( string $text, string $why = '' ) use ( &$lines ): void {
			foreach ( $lines as $line ) {
				if ( $line['text'] === $text ) {
					return;
				}
			}
			$lines[] = array(
				'text' => $text,
				'why'  => $why,
			);
		};
		$riff  = self::map( $manifest['riff'] ?? array() );

		// The player: what it adds, and what it reads.
		$functions = self::strings( $riff['functions'] ?? array() );
		$hooks     = self::strings( $riff['hooks'] ?? array() );
		$events    = self::strings( $riff['events'] ?? array() );
		$api       = self::strings( $riff['api'] ?? array() );
		if ( in_array( 'riff_register_view', $functions, true ) ) {
			$add( __( 'Adds a view to the player', 'riff' ) );
		}
		if ( in_array( 'riff_below_turntable', $hooks, true ) ) {
			$add( __( 'Adds to the space under the turntable', 'riff' ) );
		}
		if ( in_array( 'riff_register_shortcut', $functions, true ) || in_array( 'shortcut', $api, true ) ) {
			$add( __( 'Adds a keyboard shortcut to the player', 'riff' ) );
		}
		if ( in_array( 'menu', $events, true ) ) {
			$add( __( "Adds to the player's menu", 'riff' ) );
		}
		if ( in_array( 'riff_track', $hooks, true ) || in_array( 'track', $events, true ) ) {
			$add( __( 'Reads your tracks', 'riff' ) );
		}
		if ( array_intersect( array( 'play', 'pause', 'time', 'ended', 'playing' ), array_merge( $events, $api ) ) ) {
			$add( __( "Follows what's playing", 'riff' ) );
		}
		if ( in_array( 'seek', $api, true ) ) {
			$add( __( 'Can jump to a point in the song', 'riff' ) );
		}
		if ( in_array( 'speed', $api, true ) ) {
			$add( __( 'Can slow the song down or speed it up', 'riff' ) );
		}
		if ( in_array( 'analyser', $api, true ) ) {
			$add( __( 'Reads the sound as it plays', 'riff' ) );
		}
		if ( in_array( 'riff_listen_page', $functions, true ) ) {
			$add( __( 'Finds your Listen page', 'riff' ) );
		}
		if ( in_array( 'riff_abilities', $hooks, true ) ) {
			$add( __( 'Adds to what AI assistants may do with your music, where you allow them', 'riff' ) );
		}
		$known = array(
			'hooks'     => array( 'riff_register', 'riff_before_player', 'riff_below_turntable', 'riff_track', 'riff_abilities' ),
			'functions' => array( 'riff_register_view', 'riff_register_shortcut', 'riff_listen_page' ),
			'events'    => array( 'menu', 'view', 'ready', 'track', 'play', 'pause', 'time', 'ended' ),
			'api'       => array( 'seek', 'speed', 'shortcut', 'time', 'playing', 'view', 'analyser' ),
		);
		$other = array();
		foreach ( $riff as $part => $names ) {
			$other = array_merge( $other, array_diff( self::strings( $names ), $known[ $part ] ?? array() ) );
		}
		$other = array_values( array_unique( $other ) );
		if ( $other ) {
			/* translators: %s: names of Riff's hooks, functions or player members, comma-separated. */
			$add( sprintf( __( 'Uses these parts of Riff: %s', 'riff' ), implode( ', ', $other ) ) );
		}

		// What it keeps.
		$data = self::map( $manifest['data'] ?? array() );
		foreach ( self::strings( $data['options'] ?? array() ) as $prefix ) {
			/* translators: %s: an option name prefix, such as riff_lyrics_*. */
			$add( sprintf( __( 'Stores settings under %s', 'riff' ), self::wild( $prefix ) ) );
		}
		foreach ( self::strings( $data['meta'] ?? array() ) as $prefix ) {
			/* translators: %s: a meta key prefix, such as _riff_chords*. */
			$add( sprintf( __( 'Stores its own details on posts, tracks and people, under %s', 'riff' ), self::wild( $prefix ) ) );
		}
		foreach ( self::map( $data['shared'] ?? array() ) as $key => $why ) {
			/* translators: %s: a WordPress meta key or option, such as _wp_attachment_metadata. */
			$add( sprintf( __( 'Changes %s, which WordPress keeps', 'riff' ), (string) $key ), is_string( $why ) ? $why : '' );
		}
		foreach ( self::map( $data['keep'] ?? array() ) as $key => $why ) {
			/* translators: %s: an option or meta key. */
			$add( sprintf( __( "Leaves %s behind when it's deleted", 'riff' ), (string) $key ), is_string( $why ) ? $why : '' );
		}

		// Who it talks to.
		$hosts = self::strings( $manifest['hosts'] ?? array() );
		foreach ( $hosts as $host ) {
			if ( 'self' === $host ) {
				continue;
			}
			if ( str_starts_with( $host, '*.' ) ) {
				/* translators: %s: a domain name, such as gravatar.com. */
				$add( sprintf( __( 'Can contact %s and any address under it', 'riff' ), substr( $host, 2 ) ) );
			} else {
				/* translators: %s: a host name, such as api.example.com. */
				$add( sprintf( __( 'Can contact %s', 'riff' ), $host ) );
			}
		}
		if ( array_key_exists( 'hosts', $manifest ) && ! array_diff( $hosts, array( 'self' ) ) ) {
			$add( __( 'Contacts no other website', 'riff' ) );
		}

		// The REST API.
		$rest = self::map( $manifest['rest'] ?? array() );
		foreach ( self::strings( $rest['namespaces'] ?? array() ) as $namespace ) {
			/* translators: %s: a REST namespace, such as riff-sign-in/v1. */
			$add( sprintf( __( 'Adds its own REST routes, under %s', 'riff' ), '/wp-json/' . $namespace ) );
		}
		foreach ( self::strings( $rest['fields'] ?? array() ) as $field ) {
			$parts = explode( '.', $field, 2 );
			$add(
				2 === count( $parts ) && 'attachment' === $parts[0]
					/* translators: %s: a REST field's name, such as riff_lyrics. */
					? sprintf( __( 'Adds %s to your media in the REST API', 'riff' ), $parts[1] )
					/* translators: %s: a REST field, as object.field. */
					: sprintf( __( 'Adds %s to the REST API', 'riff' ), $field )
			);
		}
		foreach ( self::map( $rest['public'] ?? array() ) as $route => $why ) {
			/* translators: %s: a REST route, such as /wp-json/riff-sign-in/v1/code. */
			$add( sprintf( __( 'Lets anyone, signed in or not, use %s', 'riff' ), '/wp-json/' . $route ), is_string( $why ) ? $why : '' );
		}

		// The server.
		foreach ( self::strings( $manifest['spawn'] ?? array() ) as $program ) {
			/* translators: %s: a program's name, such as ffmpeg. */
			$add( sprintf( __( 'Runs %s on your server', 'riff' ), $program ) );
		}

		// Who may use it.
		$who = array_values( array_unique( array_map( array( self::class, 'can' ), self::strings( $manifest['capabilities'] ?? array() ) ) ) );
		if ( $who ) {
			$last = array_pop( $who );
			/* translators: 1: things a person can do, comma-separated, 2: the last one. */
			$list = $who ? sprintf( __( '%1$s or %2$s', 'riff' ), implode( ', ', $who ), $last ) : $last;
			/* translators: %s: what a person must be able to do, such as "edit the post or upload media". */
			$add( sprintf( __( 'Some of it is only for people who can %s', 'riff' ), $list ) );
		}

		// Run in Riff's sandbox, apart from the site (experimental, docs/isolation.md).
		$sandbox = self::map( $manifest['sandbox'] ?? array() );
		if ( $sandbox ) {
			$reads = self::strings( $sandbox['reads'] ?? array() );
			$add(
				$reads
					/* translators: %s: what the sandbox lets it read, comma-separated, such as track. */
					? sprintf( __( 'Runs apart from your site, reading only: %s', 'riff' ), implode( ', ', $reads ) )
					: __( 'Runs apart from your site', 'riff' )
			);
		}

		// A part this doesn't know yet, as it is written.
		$parts = array( '$schema', 'plugin', 'namespace', 'data', 'rest', 'capabilities', 'hosts', 'spawn', 'riff', 'scripts', 'modules', 'sandbox' );
		foreach ( array_diff_key( $manifest, array_flip( $parts ) ) as $part => $value ) {
			if ( is_array( $value ) ) {
				$value = implode( ', ', array_is_list( $value ) ? self::strings( $value ) : array_map( 'strval', array_keys( $value ) ) );
			} else {
				$value = is_scalar( $value ) ? (string) $value : '';
			}
			/* translators: 1: the manifest's name for a permission, 2: what it lists. */
			$add( '' !== $value ? sprintf( __( '%1$s: %2$s', 'riff' ), (string) $part, $value ) : (string) $part );
		}

		return $lines;
	}

	/**
	 * A capability as what someone must be able to do.
	 *
	 * @param string $cap A capability.
	 * @return string
	 */
	private static function can( string $cap ): string {
		$words = array(
			'read'                   => __( 'sign in', 'riff' ),
			'read_post'              => __( 'read the post', 'riff' ),
			'edit_post'              => __( 'edit the post', 'riff' ),
			'edit_posts'             => __( 'write posts', 'riff' ),
			'publish_pages'          => __( 'publish pages', 'riff' ),
			'edit_term'              => __( 'edit the category or tag', 'riff' ),
			'edit_user'              => __( 'edit the profile', 'riff' ),
			'upload_files'           => __( 'upload media', 'riff' ),
			'update_plugins'         => __( 'update plugins', 'riff' ),
			'activate_plugins'       => __( 'turn plugins on and off', 'riff' ),
			'export'                 => __( 'export the site', 'riff' ),
			'manage_options'         => __( "change the site's settings", 'riff' ),
			'manage_network_options' => __( "change the network's settings", 'riff' ),
		);
		return $words[ $cap ] ?? $cap;
	}

	/**
	 * A prefix as the names it covers: riff_lyrics_ is riff_lyrics_*.
	 *
	 * @param string $prefix A prefix.
	 * @return string
	 */
	private static function wild( string $prefix ): string {
		return str_ends_with( $prefix, '*' ) ? $prefix : $prefix . '*';
	}

	/**
	 * The strings of a list; nothing when it isn't one.
	 *
	 * @param mixed $value A list from the manifest.
	 * @return string[]
	 */
	private static function strings( $value ): array {
		return is_array( $value ) ? array_values( array_unique( array_filter( $value, static fn( $v ) => is_string( $v ) && '' !== $v ) ) ) : array();
	}

	/**
	 * An object of the manifest; nothing when it isn't one.
	 *
	 * @param mixed $value A part of the manifest.
	 * @return array
	 */
	private static function map( $value ): array {
		return is_array( $value ) ? $value : array();
	}

	/**
	 * The Riff plugins running on this site: Riff, each extension it loaded, and each active plugin
	 * that requires Riff, by slug, with its name and folder.
	 *
	 * @since 6.5.0
	 *
	 * @return array<string, array{ title: string, dir: string }>
	 */
	public static function plugins(): array {
		static $cache = array();
		$key          = md5( (string) wp_json_encode( array( self::active(), Extensions::bundled(), get_option( Extensions::OPTION ) ) ) );
		if ( isset( $cache[ $key ] ) ) {
			return $cache[ $key ];
		}
		$found = array(
			'riff' => array(
				'title' => __( 'Riff', 'riff' ),
				'dir'   => untrailingslashit( RIFF_DIR ),
			),
		);
		foreach ( array_keys( Extensions::loadable() ) as $name ) {
			$file           = (string) Extensions::file( $name );
			$found[ $name ] = array(
				'title' => self::title( $file, $name ),
				'dir'   => dirname( $file ),
			);
		}
		foreach ( self::active() as $plugin ) {
			$slug = dirname( $plugin );
			if ( '.' !== $slug && ! isset( $found[ $slug ] ) && self::requires_riff( WP_PLUGIN_DIR . '/' . $plugin ) ) {
				$found[ $slug ] = array(
					'title' => self::title( WP_PLUGIN_DIR . '/' . $plugin, $slug ),
					'dir'   => WP_PLUGIN_DIR . '/' . $slug,
				);
			}
		}
		$cache[ $key ] = $found;
		return $found;
	}

	/**
	 * The active plugins' files, this site's and the network's.
	 *
	 * @return string[]
	 */
	private static function active(): array {
		$active = (array) get_option( 'active_plugins', array() );
		if ( is_multisite() ) {
			$active = array_merge( $active, array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) );
		}
		return array_values( array_unique( array_filter( $active, 'is_string' ) ) );
	}

	/**
	 * Whether a plugin's main file names Riff in its Requires Plugins or Requires Riff header.
	 *
	 * @param string $file A plugin's main file.
	 * @return bool
	 */
	private static function requires_riff( string $file ): bool {
		if ( ! is_readable( $file ) ) {
			return false;
		}
		$data = get_file_data(
			$file,
			array(
				'plugins' => 'Requires Plugins',
				'riff'    => 'Requires Riff',
			)
		);
		return '' !== $data['riff'] || in_array( 'riff', array_map( 'trim', explode( ',', $data['plugins'] ) ), true );
	}

	/**
	 * A plugin's name, from its header.
	 *
	 * @param string $file     Its main file.
	 * @param string $fallback Its slug.
	 * @return string
	 */
	private static function title( string $file, string $fallback ): string {
		$title = is_readable( $file ) ? (string) get_file_data( $file, array( 'title' => 'Plugin Name' ) )['title'] : '';
		return '' !== $title ? $title : $fallback;
	}

	/**
	 * One plugin's list, as HTML.
	 *
	 * @since 6.5.0
	 *
	 * @param string $slug  The plugin's slug.
	 * @param string $title Its name.
	 * @param string $dir   Its folder.
	 * @param string $tag   The heading's element.
	 * @return string
	 */
	public static function render( string $slug, string $title, string $dir, string $tag = 'h3' ): string {
		$manifest = self::manifest( $dir );
		$tag      = in_array( $tag, array( 'h2', 'h3', 'h4', 'strong' ), true ) ? $tag : 'h3';
		$html     = sprintf( '<section class="riff-permissions" id="%1$s" data-plugin="%2$s"><%3$s>%4$s</%3$s>', esc_attr( self::ANCHOR . $slug ), esc_attr( $slug ), $tag, esc_html( $title ) );
		if ( null === $manifest ) {
			return $html . '<p>' . esc_html__( "It doesn't say what it does, so Riff can't list it here.", 'riff' ) . '</p></section>';
		}
		$lines = self::lines( $manifest );
		if ( ! $lines ) {
			return $html . '<p>' . esc_html__( 'It asks for nothing beyond showing in the player.', 'riff' ) . '</p></section>';
		}
		$html .= '<ul>';
		foreach ( $lines as $line ) {
			$html .= '<li>' . esc_html( $line['text'] );
			if ( '' !== $line['why'] ) {
				$html .= '<br><span class="description">' . esc_html( $line['why'] ) . '</span>';
			}
			$html .= '</li>';
		}
		return $html . '</ul></section>';
	}

	/**
	 * Settings › Riff's list of what each Riff plugin running here can do.
	 *
	 * @since 6.5.0
	 */
	public static function section(): void {
		echo '<h2 id="riff-permissions">' . esc_html__( 'What each plugin can do', 'riff' ) . '</h2>';
		echo '<p>' . esc_html__( 'Riff and each plugin built on it say what they touch, and Riff lists it here, as a phone lists what an app may do.', 'riff' ) . '</p>';
		foreach ( self::plugins() as $slug => $plugin ) {
			echo self::render( $slug, $plugin['title'], $plugin['dir'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render().
		}
	}

	/**
	 * A link to a Riff plugin's list, in its row on the Plugins screen.
	 *
	 * @since 6.5.0
	 *
	 * @param array  $meta   The row's links.
	 * @param string $plugin The plugin's file.
	 * @return array
	 */
	public static function row_meta( $meta, $plugin ): array {
		$meta = (array) $meta;
		$slug = dirname( (string) $plugin );
		if ( ! current_user_can( 'manage_options' ) || '.' === $slug || ! isset( self::plugins()[ $slug ] ) ) {
			return $meta;
		}
		$meta[] = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'options-general.php?page=' . Extensions::PAGE . '#' . self::ANCHOR . $slug ) ),
			esc_html__( 'What it can do', 'riff' )
		);
		return $meta;
	}

	/**
	 * Remembers a Riff plugin just activated, for the notice on the next screen.
	 *
	 * @since 6.5.0
	 *
	 * @param string $plugin The plugin's file.
	 */
	public static function activated( $plugin ): void {
		$plugin = (string) $plugin;
		$slug   = dirname( $plugin );
		if ( '.' === $slug || ( 'riff' !== $slug && ! self::requires_riff( WP_PLUGIN_DIR . '/' . $plugin ) ) ) {
			return;
		}
		self::pend(
			$slug,
			array(
				'title' => self::title( WP_PLUGIN_DIR . '/' . $plugin, $slug ),
				'dir'   => WP_PLUGIN_DIR . '/' . $slug,
			)
		);
	}

	/**
	 * Remembers an extension switched on, on Settings › Riff, for the notice.
	 *
	 * @since 6.5.0
	 *
	 * @param mixed $old   The extensions' states before.
	 * @param mixed $value The extensions' states now.
	 */
	public static function turned_on( $old, $value ): void {
		foreach ( (array) $value as $name => $state ) {
			if ( 'on' !== $state || 'off' !== ( ( (array) $old )[ $name ] ?? 'on' ) ) {
				continue;
			}
			$file = Extensions::file( (string) $name );
			if ( $file ) {
				self::pend(
					(string) $name,
					array(
						'title' => self::title( $file, (string) $name ),
						'dir'   => dirname( $file ),
					)
				);
			}
		}
	}

	/**
	 * Adds a plugin to the current user's notice.
	 *
	 * @param string                              $slug   The plugin's slug.
	 * @param array{ title: string, dir: string } $plugin Its name and folder.
	 */
	private static function pend( string $slug, array $plugin ): void {
		$user = get_current_user_id();
		if ( ! $user ) {
			return;
		}
		$pending          = (array) get_transient( self::PENDING . '_' . $user );
		$pending[ $slug ] = $plugin;
		set_transient( self::PENDING . '_' . $user, $pending, HOUR_IN_SECONDS );
	}

	/**
	 * The notice after a Riff plugin is activated or turned on: what it can do, once.
	 *
	 * @since 6.5.0
	 */
	public static function notice(): void {
		$user = get_current_user_id();
		if ( ! $user || ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		$pending = get_transient( self::PENDING . '_' . $user );
		if ( ! is_array( $pending ) || ! $pending ) {
			return;
		}
		delete_transient( self::PENDING . '_' . $user );
		$html = '';
		foreach ( $pending as $slug => $plugin ) {
			if ( is_array( $plugin ) && isset( $plugin['title'], $plugin['dir'] ) ) {
				/* translators: %s: a plugin's name. */
				$heading = sprintf( __( '%s is on. Here is what it can do.', 'riff' ), (string) $plugin['title'] );
				$html   .= self::render( (string) $slug, $heading, (string) $plugin['dir'], 'strong' );
			}
		}
		if ( '' === $html ) {
			return;
		}
		$html .= sprintf(
			'<p><a href="%s">%s</a></p>',
			esc_url( admin_url( 'options-general.php?page=' . Extensions::PAGE . '#riff-permissions' ) ),
			esc_html__( 'See what every Riff plugin can do', 'riff' )
		);
		wp_admin_notice(
			$html,
			array(
				'type'               => 'info',
				'dismissible'        => true,
				'paragraph_wrap'     => false,
				'additional_classes' => array( 'riff-permissions-notice' ),
			)
		);
	}
}
