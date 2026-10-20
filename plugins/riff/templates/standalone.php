<?php
/**
 * Standalone mode's document: the Riff block on its own, in Riff's dark look, outside the theme.
 * Riff\Listen\Standalone::template() loads it for a Listen page's app/ address.
 *
 * @package Riff
 */

use Riff\Listen\App;
use Riff\Listen\Standalone;

defined( 'ABSPATH' ) || exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="<?php echo esc_attr( Standalone::BACKGROUND ); ?>">
<meta name="color-scheme" content="dark">
<title><?php echo esc_html( wp_get_document_title() ); ?></title>
<link rel="manifest" href="<?php echo esc_url( Standalone::url( 0, true ) ); ?>">
<link rel="apple-touch-icon" href="<?php echo esc_url( get_site_icon_url( 180 ) ? get_site_icon_url( 180 ) : RIFF_URL . 'features/listen/icons/icon-192.png' ); ?>">
<?php wp_head(); ?>
</head>
<body class="riff-standalone">
<?php wp_body_open(); ?>
<main class="riff-standalone-main">
<?php echo App::render( array( 'align' => 'full' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the block's own markup, escaped where it is built. ?>
<?php
// A sidebar this device collapsed is drawn collapsed from the start, before the page is painted,
// rather than folding once app.js runs.
wp_print_inline_script_tag( 'try{if(localStorage.getItem("riff-sidebar")==="mini"){document.querySelector("[data-riff-app]").dataset.sidebar="mini";}}catch(e){}' );
?>
</main>
<?php wp_footer(); ?>
</body>
</html>
