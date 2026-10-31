<?php
/**
 * Extensions: plugins of the monorepo that ship inside Riff, each its own plugin in the repository,
 * loaded by Riff as if it were installed beside it.
 *
 * @since 5.8.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * The extensions that ship inside Riff, as extensions.json names them. A release copies each into extensions/<name>/ (build-riff.sh); a
 * checkout of the repository has no extensions/ folder, and finds each beside Riff, where the
 * repository keeps it, so nothing is copied twice. Riff loads each one's main file while WordPress
 * loads plugins, before plugins_loaded, as WordPress would load it, unless:
 *
 * - it is turned off, on Settings › Riff or for the whole network, on Network Admin › Settings ›
 *   Riff, where a network admin can lock it;
 * - it is installed and active as its own plugin, which WordPress loads itself;
 * - it needs a newer Riff than this one (its Requires Riff header).
 *
 * An extension uses Riff's public hooks and APIs as any plugin does; being bundled only changes
 * where its files come from.
 */
final class Extensions {

	/**
	 * Each site's choice: an extension's name, and `on` or `off`. One that is not named is on.
	 *
	 * @since 5.8.0
	 */
	public const OPTION = 'riff_extensions';

	/**
	 * The network's choice, on multisite: an extension's name, and `{ state: on|off, locked }`.
	 * Locked, the network's state is every site's; unlocked, a site's own choice comes first.
	 *
	 * @since 5.8.0
	 */
	public const NETWORK = 'riff_extensions_network';

	/**
	 * The settings screen's slug, under Settings and, on a network, Network Admin › Settings.
	 *
	 * @since 5.8.0
	 */
	public const PAGE = 'riff';

	/**
	 * Why an extension was not loaded, by name, for the settings screen.
	 *
	 * @var array<string, string>
	 */
	private static $skipped = array();

	/**
	 * The extensions this Riff ships, by name, as extensions.json lists them.
	 *
	 * @since 5.8.0
	 *
	 * @return string[]
	 */
	public static function bundled(): array {
		static $listed = null;
		if ( null === $listed ) {
			$json   = is_readable( RIFF_DIR . 'extensions.json' ) ? (string) file_get_contents( RIFF_DIR . 'extensions.json' ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Riff's own manifest, on disk.
			$listed = array_values( array_filter( (array) ( json_decode( $json, true )['extensions'] ?? array() ), 'is_string' ) );
		}
		/**
		 * Filters the extensions Riff loads, by name: a host can leave one out, or name another
		 * plugin it has placed in Riff's extensions/ folder.
		 *
		 * @since 5.8.0
		 *
		 * @param string[] $names The names in extensions.json.
		 */
		$names = (array) apply_filters( 'riff_extensions', $listed );
		return array_values( array_unique( array_filter( $names, static fn( $name ) => is_string( $name ) && preg_match( '/^[a-z0-9-]+$/', $name ) ) ) );
	}

	/**
	 * An extension's main file: in extensions/ in a release, beside Riff in a checkout. Null when
	 * there is none.
	 *
	 * @since 5.8.0
	 *
	 * @param string $name The extension's name.
	 * @return string|null
	 */
	public static function file( string $name ): ?string {
		$base = is_dir( RIFF_DIR . 'extensions' ) ? RIFF_DIR . 'extensions/' : trailingslashit( dirname( RIFF_DIR ) );
		$file = $base . $name . '/' . $name . '.php';
		return is_readable( $file ) ? $file : null;
	}

	/**
	 * Whether an extension is installed and active as its own plugin, here or across the network.
	 *
	 * @since 5.8.0
	 *
	 * @param string $name The extension's name.
	 * @return bool
	 */
	public static function standalone( string $name ): bool {
		$plugin = $name . '/' . $name . '.php';
		if ( in_array( $plugin, (array) get_option( 'active_plugins', array() ), true ) ) {
			return true;
		}
		return is_multisite() && isset( ( (array) get_site_option( 'active_sitewide_plugins', array() ) )[ $plugin ] );
	}

	/**
	 * Whether an extension is on for this site: the network's state while it is locked, else the
	 * site's own choice, else the network's, else on.
	 *
	 * @since 5.8.0
	 *
	 * @param string $name The extension's name.
	 * @return bool
	 */
	public static function on( string $name ): bool {
		$network = is_multisite() ? (array) ( ( (array) get_site_option( self::NETWORK, array() ) )[ $name ] ?? array() ) : array();
		if ( ! empty( $network['locked'] ) ) {
			return 'off' !== ( $network['state'] ?? 'on' );
		}
		$site = (array) get_option( self::OPTION, array() );
		if ( isset( $site[ $name ] ) ) {
			return 'off' !== $site[ $name ];
		}
		return 'off' !== ( $network['state'] ?? 'on' );
	}

	/**
	 * Whether the network has locked an extension's state for every site.
	 *
	 * @since 5.8.0
	 *
	 * @param string $name The extension's name.
	 * @return bool
	 */
	public static function locked( string $name ): bool {
		return is_multisite() && ! empty( ( (array) get_site_option( self::NETWORK, array() ) )[ $name ]['locked'] );
	}

	/**
	 * The extensions to load now, by name and main file, and why the others are not.
	 *
	 * @since 5.8.0
	 *
	 * @return array<string, string> Main files by name.
	 */
	public static function loadable(): array {
		$load          = array();
		self::$skipped = array();
		foreach ( self::bundled() as $name ) {
			$file = self::file( $name );
			if ( ! $file ) {
				self::$skipped[ $name ] = 'missing';
			} elseif ( self::standalone( $name ) ) {
				self::$skipped[ $name ] = 'standalone';
			} elseif ( ! self::on( $name ) ) {
				self::$skipped[ $name ] = 'off';
			} elseif ( ! version_compare( RIFF_VERSION, self::needs( $file ), '>=' ) ) {
				self::$skipped[ $name ] = 'riff';
			} else {
				$load[ $name ] = $file;
			}
		}
		return $load;
	}

	/**
	 * Loads the extensions that are on, as WordPress loads a plugin. Runs as Riff's main file loads.
	 *
	 * @since 5.8.0
	 */
	public static function load(): void {
		foreach ( self::loadable() as $file ) {
			include_once $file;
		}
		add_action( 'admin_menu', array( self::class, 'menu' ) );
		add_action( 'network_admin_menu', array( self::class, 'network_menu' ) );
		add_action( 'admin_init', array( self::class, 'settings' ) );
		add_action( 'network_admin_edit_' . self::PAGE, array( self::class, 'save_network' ) );
	}

	/**
	 * The oldest Riff an extension works with, from its Requires Riff header; 0 for any.
	 *
	 * @param string $file Its main file.
	 * @return string
	 */
	private static function needs( string $file ): string {
		$needs = (string) get_file_data( $file, array( 'riff' => 'Requires Riff' ) )['riff'];
		return '' !== $needs ? $needs : '0';
	}

	/**
	 * An extension's name and description, from its main file's header.
	 *
	 * @param string $name The extension's name.
	 * @return array{ title: string, description: string }
	 */
	private static function about( string $name ): array {
		$file = self::file( $name );
		$data = $file ? get_file_data(
			$file,
			array(
				'title'       => 'Plugin Name',
				'description' => 'Description',
			)
		) : array();
		return array(
			'title'       => '' !== ( $data['title'] ?? '' ) ? $data['title'] : $name,
			'description' => (string) ( $data['description'] ?? '' ),
		);
	}

	/**
	 * Settings › Riff.
	 *
	 * @since 5.8.0
	 */
	public static function menu(): void {
		if ( ! self::bundled() ) {
			return;
		}
		add_options_page( __( 'Riff', 'riff' ), __( 'Riff', 'riff' ), 'manage_options', self::PAGE, array( self::class, 'page' ) );
	}

	/**
	 * The site's extensions, with the Settings API.
	 *
	 * @since 5.8.0
	 */
	public static function settings(): void {
		register_setting(
			self::PAGE,
			self::OPTION,
			array(
				'type'              => 'object',
				'sanitize_callback' => array( self::class, 'sanitize' ),
				'default'           => array(),
			)
		);
		add_settings_section( 'riff-extensions', __( 'Extensions', 'riff' ), array( self::class, 'intro' ), self::PAGE );
		foreach ( self::bundled() as $name ) {
			add_settings_field(
				'riff-extension-' . $name,
				esc_html( self::about( $name )['title'] ),
				array( self::class, 'field' ),
				self::PAGE,
				'riff-extensions',
				array( 'name' => $name )
			);
		}
	}

	/**
	 * What the section is for.
	 *
	 * @since 5.8.0
	 */
	public static function intro(): void {
		echo '<p>' . esc_html__( 'Parts of Riff that come with it, each its own plugin. One that is off is not loaded at all.', 'riff' ) . '</p>';
	}

	/**
	 * One extension's switch, and why it may not be the site's to change.
	 *
	 * @since 5.8.0
	 *
	 * @param array $args `{ name }`.
	 */
	public static function field( $args ): void {
		$name   = (string) ( $args['name'] ?? '' );
		$about  = self::about( $name );
		$locked = self::locked( $name );
		self::loadable();
		$why = array(
			'standalone' => __( 'Installed as its own plugin, which runs instead.', 'riff' ),
			'riff'       => __( 'Needs a newer Riff.', 'riff' ),
			'missing'    => __( 'Its files are missing.', 'riff' ),
		)[ self::$skipped[ $name ] ?? '' ] ?? '';
		printf(
			'<input type="hidden" name="%1$s[%2$s]" value="off"><label><input type="checkbox" name="%1$s[%2$s]" value="on"%3$s%4$s> %5$s</label>',
			esc_attr( self::OPTION ),
			esc_attr( $name ),
			checked( self::on( $name ), true, false ),
			disabled( $locked, true, false ),
			esc_html( $about['description'] )
		);
		if ( $locked ) {
			echo '<p class="description">' . esc_html__( 'Set for every site on the network.', 'riff' ) . '</p>';
		} elseif ( '' !== $why ) {
			echo '<p class="description">' . esc_html( $why ) . '</p>';
		}
	}

	/**
	 * Keeps only the bundled extensions' names, each on or off.
	 *
	 * @since 5.8.0
	 *
	 * @param mixed $value Posted value.
	 * @return array<string, string>
	 */
	public static function sanitize( $value ): array {
		$clean = array();
		foreach ( self::bundled() as $name ) {
			if ( is_array( $value ) && isset( $value[ $name ] ) ) {
				$clean[ $name ] = 'on' === $value[ $name ] ? 'on' : 'off';
			}
		}
		return $clean;
	}

	/**
	 * Settings › Riff's page.
	 *
	 * @since 5.8.0
	 */
	public static function page(): void {
		echo '<div class="wrap"><h1>' . esc_html__( 'Riff', 'riff' ) . '</h1><form action="options.php" method="post">';
		settings_fields( self::PAGE );
		do_settings_sections( self::PAGE );
		submit_button();
		echo '</form></div>';
	}

	/**
	 * Network Admin › Settings › Riff.
	 *
	 * @since 5.8.0
	 */
	public static function network_menu(): void {
		if ( ! self::bundled() ) {
			return;
		}
		add_submenu_page( 'settings.php', __( 'Riff', 'riff' ), __( 'Riff', 'riff' ), 'manage_network_options', self::PAGE, array( self::class, 'network_page' ) );
	}

	/**
	 * The network's extensions: each on or off, and whether every site keeps that.
	 *
	 * @since 5.8.0
	 */
	public static function network_page(): void {
		$network = (array) get_site_option( self::NETWORK, array() );
		echo '<div class="wrap"><h1>' . esc_html__( 'Riff', 'riff' ) . '</h1>';
		if ( isset( $_GET['updated'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a notice after the redirect.
			echo '<div class="notice notice-success"><p>' . esc_html__( 'Settings saved.', 'riff' ) . '</p></div>';
		}
		echo '<form action="' . esc_url( network_admin_url( 'edit.php?action=' . self::PAGE ) ) . '" method="post">';
		wp_nonce_field( self::NETWORK );
		echo '<h2>' . esc_html__( 'Extensions', 'riff' ) . '</h2><p>' . esc_html__( 'Parts of Riff that come with it. A site chooses for itself unless one is locked here.', 'riff' ) . '</p><table class="form-table" role="presentation">';
		foreach ( self::bundled() as $name ) {
			$about = self::about( $name );
			$state = (array) ( $network[ $name ] ?? array() );
			printf(
				'<tr><th scope="row">%1$s</th><td><input type="hidden" name="extensions[%2$s][state]" value="off"><label><input type="checkbox" name="extensions[%2$s][state]" value="on"%3$s> %4$s</label><br><label><input type="checkbox" name="extensions[%2$s][locked]" value="1"%5$s> %6$s</label></td></tr>',
				esc_html( $about['title'] ),
				esc_attr( $name ),
				checked( 'off' !== ( $state['state'] ?? 'on' ), true, false ),
				esc_html( $about['description'] ),
				checked( ! empty( $state['locked'] ), true, false ),
				esc_html__( 'The same for every site', 'riff' )
			);
		}
		echo '</table>';
		submit_button();
		echo '</form></div>';
	}

	/**
	 * Saves the network's extensions.
	 *
	 * @since 5.8.0
	 */
	public static function save_network(): void {
		check_admin_referer( self::NETWORK );
		if ( ! current_user_can( 'manage_network_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to manage options for this network.', 'riff' ), 403 );
		}
		$posted = isset( $_POST['extensions'] ) && is_array( $_POST['extensions'] ) ? wp_unslash( $_POST['extensions'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- each value is reduced to on, off or a flag below.
		update_site_option( self::NETWORK, self::sanitize_network( $posted ) );
		wp_safe_redirect( add_query_arg( 'updated', 'true', network_admin_url( 'settings.php?page=' . self::PAGE ) ) );
		exit;
	}

	/**
	 * Keeps only the bundled extensions' names, each on or off and locked or not.
	 *
	 * @since 5.8.0
	 *
	 * @param mixed $value Posted value.
	 * @return array<string, array{ state: string, locked: bool }>
	 */
	public static function sanitize_network( $value ): array {
		$clean = array();
		foreach ( self::bundled() as $name ) {
			$posted         = is_array( $value ) && is_array( $value[ $name ] ?? null ) ? $value[ $name ] : array();
			$clean[ $name ] = array(
				'state'  => 'on' === ( $posted['state'] ?? 'on' ) ? 'on' : 'off',
				'locked' => ! empty( $posted['locked'] ),
			);
		}
		return $clean;
	}
}
