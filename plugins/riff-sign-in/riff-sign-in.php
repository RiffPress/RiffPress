<?php
/**
 * Plugin Name: Riff Sign In
 * Description: Listeners sign in to Riff with a passkey, or a code sent to their email, from a sheet inside the player; no passwords, and the music keeps playing.
 * Version: 0.1.0
 * Requires at least: 7.0
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-sign-in
 *
 * @package Riff\SignIn
 */

defined( 'ABSPATH' ) || exit;

define( 'RIFF_SIGN_IN_VERSION', '0.1.0' );
define( 'RIFF_SIGN_IN_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-cbor.php';
require __DIR__ . '/src/class-passkeys.php';
require __DIR__ . '/src/class-codes.php';
require __DIR__ . '/src/class-routes.php';
require __DIR__ . '/src/class-sign-in.php';

Riff\SignIn\Sign_In::register();
