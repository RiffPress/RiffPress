<?php
/**
 * Riff's abilities for AI assistants, over the Model Context Protocol, through the MCP Adapter.
 *
 * @since 6.5.0
 * @package Riff
 */

namespace Riff;

use WP_REST_Request;

defined( 'ABSPATH' ) || exit;

/**
 * MCP.
 *
 * WordPress's MCP Adapter plugin serves abilities to MCP clients, such as Claude, over REST,
 * signed in as a WordPress user, with an application password. Riff adds nothing of its own to
 * that but a server, `/wp-json/mcp/riff`, with each of its abilities as a tool, and the abilities
 * themselves, which run their REST routes as that user. It is off unless the site turns it on, on
 * Settings › Riff or with the `riff_mcp` filter: until then there is no server, over HTTP or the
 * adapter's WP-CLI command, and the adapter's own default server does not list Riff's abilities.
 */
final class Mcp {

	/**
	 * The site option: true once the site lets AI assistants in.
	 *
	 * @since 6.5.0
	 */
	public const OPTION = 'riff_mcp';

	/**
	 * The server's ID, and its route under the adapter's `mcp` namespace.
	 *
	 * @since 6.5.0
	 */
	public const SERVER = 'riff';

	/**
	 * Hooks the setting, its field, the abilities' exposure and the server.
	 *
	 * @since 6.5.0
	 */
	public static function register(): void {
		add_action( 'init', array( self::class, 'setting' ) );
		add_action( 'admin_init', array( self::class, 'field' ) );
		add_filter( 'wp_register_ability_args', array( self::class, 'expose' ), 10, 2 );
		add_action( 'mcp_adapter_init', array( self::class, 'server' ) );
	}

	/**
	 * The setting, on Settings › Riff and in the REST settings route.
	 *
	 * @since 6.5.0
	 */
	public static function setting(): void {
		register_setting(
			Extensions::PAGE,
			self::OPTION,
			array(
				'type'              => 'boolean',
				'description'       => __( 'Whether AI assistants may use Riff\'s abilities over MCP.', 'riff' ),
				'default'           => false,
				'sanitize_callback' => 'rest_sanitize_boolean',
				'show_in_rest'      => true,
			)
		);
	}

	/**
	 * The checkbox on Settings › Riff, in a section of its own.
	 *
	 * @since 6.5.0
	 */
	public static function field(): void {
		add_settings_section( 'riff-mcp', __( 'AI assistants', 'riff' ), '__return_false', Extensions::PAGE );
		add_settings_field(
			self::OPTION,
			__( 'MCP', 'riff' ),
			static function (): void {
				$saved = rest_sanitize_boolean( get_option( self::OPTION, false ) );
				$on    = self::on();
				$about = class_exists( 'WP\MCP\Core\McpAdapter' )
					/* translators: %s: The MCP server's address. */
					? sprintf( __( 'An MCP client, such as Claude, connects to %s, signed in with an application password from your profile. It can do what you can: list the library, make albums, set a track\'s details, import a zip.', 'riff' ), rest_url( 'mcp/' . self::SERVER ) )
					: __( 'Needs the MCP Adapter plugin, which serves WordPress\'s abilities to MCP clients such as Claude.', 'riff' );
				printf(
					'<label for="%1$s"><input name="%1$s" type="checkbox" id="%1$s" value="1"%2$s%3$s> %4$s</label><p class="description">%5$s</p>',
					esc_attr( self::OPTION ),
					checked( $on, true, false ),
					disabled( $on !== $saved, true, false ),
					esc_html__( 'Let AI assistants use Riff, signed in as someone on this site', 'riff' ),
					esc_html( $on !== $saved ? __( 'Set for this site by a plugin.', 'riff' ) : $about )
				);
			},
			Extensions::PAGE,
			'riff-mcp'
		);
	}

	/**
	 * Whether AI assistants may use Riff's abilities over MCP.
	 *
	 * @since 6.5.0
	 *
	 * @return bool
	 */
	public static function on(): bool {
		/**
		 * Filters whether AI assistants may use Riff's abilities over MCP. On, and with the MCP
		 * Adapter plugin active, `/wp-json/mcp/riff` serves each of them as a tool to a signed-in
		 * user, and the adapter's default server lists them. Each still does only what that user
		 * may do. Off, there is no such server, and the default server does not list them.
		 *
		 * A host that offers it on every site turns it on with
		 * `add_filter( 'riff_mcp', '__return_true' )`.
		 *
		 * @since 6.5.0
		 *
		 * @param bool $on Whether it is on, from Settings › Riff. Default false.
		 */
		return (bool) apply_filters( 'riff_mcp', rest_sanitize_boolean( get_option( self::OPTION, false ) ) );
	}

	/**
	 * Offers Riff's abilities through the MCP Adapter's default server while MCP is on.
	 *
	 * @since 6.5.0
	 *
	 * @param array  $args The ability's arguments.
	 * @param string $name Its name.
	 * @return array
	 */
	public static function expose( $args, $name ): array {
		unset( $name );
		$args = (array) $args;
		if ( Abilities::CATEGORY === ( $args['category'] ?? '' ) ) {
			$args['meta']['mcp']['public'] = self::on();
		}
		return $args;
	}

	/**
	 * Riff's MCP server, `/wp-json/mcp/riff`: each ability a tool, for a signed-in user, while MCP
	 * is on.
	 *
	 * @since 6.5.0
	 *
	 * @param object $adapter The MCP Adapter.
	 */
	public static function server( $adapter ): void {
		if ( ! self::on() || ! is_object( $adapter ) || ! method_exists( $adapter, 'create_server' ) || ! class_exists( 'WP\MCP\Transport\HttpTransport' ) || ! function_exists( 'wp_get_ability' ) ) {
			return;
		}
		$tools = array_values( array_filter( array_keys( Abilities::all() ), static fn( string $name ): bool => null !== wp_get_ability( $name ) ) );
		$adapter->create_server(
			self::SERVER,
			'mcp',
			self::SERVER,
			__( 'Riff', 'riff' ),
			__( 'The music in this site\'s Media Library: its tracks, albums and artists, making albums and playlists, setting a track\'s details and importing a zip.', 'riff' ),
			defined( 'RIFF_VERSION' ) ? RIFF_VERSION : '0',
			array( 'WP\MCP\Transport\HttpTransport' ),
			class_exists( 'WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler' ) ? 'WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler' : null,
			null,
			$tools,
			array(),
			array(),
			array( self::class, 'allowed' )
		);
	}

	/**
	 * Who the server lets in: while MCP is on, a signed-in user who can read the site. What each
	 * of them may then do is each ability's to say.
	 *
	 * @since 6.5.0
	 *
	 * @param WP_REST_Request $request The request.
	 * @return bool
	 */
	public static function allowed( $request = null ): bool {
		unset( $request );
		return self::on() && is_user_logged_in() && current_user_can( 'read' );
	}
}
