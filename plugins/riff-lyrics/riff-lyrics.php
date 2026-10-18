<?php
/**
 * Plugin Name: Riff Lyrics
 * Description: A Lyrics tab beside Up next in Riff's Now Playing, from the lyrics in your audio files or typed into the Media Library.
 * Version: 0.1.0
 * Requires at least: 7.0
 * Requires PHP: 8.1
 * Requires Plugins: riff
 * Plugin URI: https://riffpress.com/
 * Author: RiffPress Core Team
 * Author URI: https://riffpress.com/
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: riff-lyrics
 *
 * @package Riff\Lyrics
 */

defined( 'ABSPATH' ) || exit;

define( 'RIFF_LYRICS_VERSION', '0.1.0' );
define( 'RIFF_LYRICS_URL', plugin_dir_url( __FILE__ ) );

require __DIR__ . '/src/class-lyrics.php';

Riff\Lyrics\Lyrics::register();
