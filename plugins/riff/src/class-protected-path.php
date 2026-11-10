<?php
/**
 * Where protected files are kept, kept up with: the move when a host changes the path, and the
 * warnings when the folder is not as private as it should be.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

defined( 'ABSPATH' ) || exit;

/**
 * A host can keep protected files outside the web root, with RIFF_PROTECTED_PATH or the
 * riff_protected_path filter (Protected_Files::configured()). When the folder they belong in
 * changes, a background job moves the files already protected there, a batch at a time, and
 * `wp riff protected move` does it at once. An administrator is told, on the Dashboard, the Media
 * Library, Settings › Riff and Site Health, when the path a host set can't be used, when files
 * couldn't be moved, and when the web server sends the protected folder to anyone, which Settings ›
 * Riff asks the server about when nobody has for a day.
 */
final class Protected_Path {

	/**
	 * The screens the notices show on.
	 */
	private const SCREENS = array( 'dashboard', 'upload', 'site-health', 'settings_page_' . Extensions::PAGE );

	/**
	 * Hooks in.
	 *
	 * @since 6.5.0
	 */
	public static function register(): void {
		add_action( 'admin_init', array( self::class, 'check' ) );
		add_action( Protected_Files::JOB, array( self::class, 'sweep' ) );
		add_action( 'load-settings_page_' . Extensions::PAGE, array( self::class, 'ask' ) );
		add_action( 'admin_notices', array( self::class, 'notices' ) );
		add_action( 'delete_attachment', array( Protected_Files::class, 'deleted' ) );
		// Before core's own, at 10, which drops the site's tables and empties its uploads.
		add_action( 'wp_uninitialize_site', array( Protected_Files::class, 'forget' ), 5 );
	}

	/**
	 * Starts the move when files are still in a folder they no longer belong in. A pass that left
	 * some behind is tried again an hour on, not on every screen.
	 *
	 * @since 6.5.0
	 */
	public static function check(): void {
		if ( ! Protected_Files::pending() || wp_next_scheduled( Protected_Files::JOB ) ) {
			return;
		}
		$state = get_option( Protected_Files::MOVE );
		if ( is_array( $state ) && ! empty( $state['tried'] ) && time() - (int) $state['tried'] < HOUR_IN_SECONDS ) {
			return;
		}
		wp_schedule_single_event( time(), Protected_Files::JOB );
	}

	/**
	 * Moves a batch, and comes back for the next one while there is one. While another pass holds
	 * the move it leaves it, and that pass comes back instead.
	 *
	 * @since 6.5.0
	 */
	public static function sweep(): void {
		if ( Protected_Files::pending() && Protected_Files::migrate()['left'] ) {
			wp_schedule_single_event( time(), Protected_Files::JOB );
		}
	}

	/**
	 * Settings › Riff asks the web server about the protected folder when nobody has for a day, so
	 * the page says how it stands. A folder outside the web root isn't asked about.
	 *
	 * @since 6.5.0
	 */
	public static function ask(): void {
		if ( current_user_can( 'manage_options' ) && Protected_Files::folders() && false === get_transient( Protect::OPEN ) && '' !== Protected_Files::exposed() ) {
			Protect::probe();
		}
	}

	/**
	 * The notices, each only when there is something to do.
	 *
	 * @since 6.5.0
	 */
	public static function notices(): void {
		$screen = get_current_screen();
		if ( ! $screen || ! in_array( $screen->id, self::SCREENS, true ) || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		foreach ( self::messages() as $kind => $html ) {
			printf( '<div class="notice notice-%1$s">%2$s</div>', esc_attr( $kind ), wp_kses_post( $html ) );
		}
	}

	/**
	 * What the notices say, by kind: error, warning.
	 *
	 * @since 6.5.0
	 *
	 * @return array<string, string> HTML paragraphs, by notice kind.
	 */
	public static function messages(): array {
		$messages = array();
		$refusal  = Protected_Files::refusal();
		if ( null !== $refusal ) {
			$messages['error'] = '<p>' . sprintf(
				'web' === $refusal
					/* translators: 1: the folder, 2: RIFF_PROTECTED_PATH. */
					? __( 'Riff can\'t keep protected files in %1$s: it is inside the web root, where the server may send them to anyone. They stay in the protected folder under uploads until %2$s names a folder outside the web root.', 'riff' )
					/* translators: 1: the folder, 2: RIFF_PROTECTED_PATH. */
					: __( 'Riff can\'t keep protected files in %1$s: it is not an absolute path. They stay in the protected folder under uploads until %2$s names a folder outside the web root.', 'riff' ),
				'<code>' . esc_html( Protected_Files::configured() ) . '</code>',
				'<code>RIFF_PROTECTED_PATH</code>'
			) . '</p>';
		}
		$state = get_option( Protected_Files::MOVE );
		if ( is_array( $state ) && ! empty( $state['stuck'] ) && Protected_Files::pending() ) {
			$messages['error'] = ( $messages['error'] ?? '' ) . '<p>' . sprintf(
				/* translators: 1: how many files, 2: the folder, 3: the command. */
				_n( 'Riff couldn\'t move %1$d protected file to %2$s. It stays where it is, at the same address, and Riff tries again within the hour; %3$s says why.', 'Riff couldn\'t move %1$d protected files to %2$s. They stay where they are, at the same addresses, and Riff tries again within the hour; %3$s says why.', (int) $state['stuck'], 'riff' ),
				(int) $state['stuck'],
				'<code>' . esc_html( (string) $state['to'] ) . '</code>',
				'<code>wp riff protected move</code>'
			) . '</p>';
		}
		if ( Protect::open() ) {
			$messages['warning'] = '<p><strong>' . esc_html__( 'Protected files can be downloaded directly on this server.', 'riff' ) . '</strong></p>' . Protect::advice();
		}
		return $messages;
	}
}
