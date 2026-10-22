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
<?php
// Installed as an app on a computer, the page is laid out as the desktop app is: riff-desktop for
// the frame, and riff-desktop-overlay where the window has no title bar and its controls sit in
// the app's strip. A listener can turn the title bar back on, so it follows the change.
wp_print_inline_script_tag( '(function(){try{var r=document.documentElement,q=["(display-mode: window-controls-overlay)","(display-mode: standalone) and (pointer: fine)"].map(function(x){return matchMedia(x);});var s=function(){var o=q[0].matches;if(o||q[1].matches){r.classList.add("riff-desktop","riff-installed");}else if(r.classList.contains("riff-installed")){r.classList.remove("riff-desktop","riff-installed");}r.classList.toggle("riff-desktop-overlay",o);};s();q.forEach(function(x){x.addEventListener("change",s);});}catch(e){}})();' );
// Riff's desktop app marks the document itself. On a development site (SCRIPT_DEBUG or WP_DEBUG),
// ?riff_desktop=1 lays the page out as the app does, traffic lights drawn in, to work on with a
// browser's tools; the choice is kept in this browser until ?riff_desktop=0.
if ( ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) || ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
	wp_print_inline_script_tag( 'try{var d=new URLSearchParams(location.search).get("riff_desktop");if(d!==null){d==="0"?localStorage.removeItem("riff-desktop"):localStorage.setItem("riff-desktop","1");}if(localStorage.getItem("riff-desktop")){document.documentElement.classList.add("riff-desktop","riff-desktop-inset","riff-desktop-preview");}}catch(e){}' );
}
wp_head();
?>
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
