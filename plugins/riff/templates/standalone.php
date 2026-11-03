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
// On a computer, in a browser or installed as a web app, the page is laid out as Riff's desktop app
// is, in the desktop frame, while the window is wide enough for it; narrower, and on a phone or a
// tablet or a car's screen, the touch layout stands on its own, and the browser has back and
// forward of its own. The frame follows the window as it crosses that width. Riff's desktop app has
// marked the document before this runs and keeps its frame at any width, as the strip is how its
// window is dragged. Installed with the window's controls over the page, it is riff-desktop-overlay
// too, and the strip is the title bar. A listener can turn the title bar back on, so that follows
// the change. riff-desktop-app says the desktop app marked it, rather than a browser's window being
// wide, for what only a window of the app's own does: a post opens in a new window (menu.js).
wp_print_inline_script_tag( '(function(){try{var r=document.documentElement,app=r.classList.contains("riff-desktop"),o=matchMedia("(display-mode: window-controls-overlay)"),m=matchMedia("(hover: hover) and (pointer: fine) and (min-width: 900px)");if(app){r.classList.add("riff-desktop-app");}var s=function(){r.classList.toggle("riff-desktop-overlay",o.matches);if(!app&&!r.classList.contains("riff-desktop-preview")){r.classList.toggle("riff-desktop",o.matches||m.matches);}};s();o.addEventListener("change",s);m.addEventListener("change",s);}catch(e){}})();' );
// Riff's desktop app marks the document itself. On a development site (SCRIPT_DEBUG or WP_DEBUG),
// ?riff_desktop=1 lays the page out as the app does, traffic lights drawn in, to work on with a
// browser's tools; the choice is kept in this browser until ?riff_desktop=0.
if ( ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) || ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
	wp_print_inline_script_tag( 'try{var d=new URLSearchParams(location.search).get("riff_desktop");if(d!==null){d==="0"?localStorage.removeItem("riff-desktop"):localStorage.setItem("riff-desktop","1");}if(localStorage.getItem("riff-desktop")){document.documentElement.classList.add("riff-desktop","riff-desktop-app","riff-desktop-inset","riff-desktop-preview");}}catch(e){}' );
}
wp_head();
// The frame standalone.css chose for this window, copied to <html data-riff-frame> once the
// stylesheets are in and before anything is painted, and again whenever the window changes it,
// with a riff:frame event. The desktop frame shows where it is sidebar, and always in Riff's desktop
// app or installed with the window's controls over the page: the document is then riff-frame.
// No size is written here: the frame is CSS's.
wp_print_inline_script_tag( '(function(){var r=document.documentElement,read=function(){var f=getComputedStyle(r).getPropertyValue("--riff-frame").trim()||"tabs";r.classList.toggle("riff-frame",f==="sidebar"||r.classList.contains("riff-desktop-app")||r.classList.contains("riff-desktop-overlay"));if(r.dataset.riffFrame!==f){r.dataset.riffFrame=f;dispatchEvent(new CustomEvent("riff:frame",{detail:f}));}};read();addEventListener("resize",read);matchMedia("(display-mode: window-controls-overlay)").addEventListener("change",read);})();' );
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
