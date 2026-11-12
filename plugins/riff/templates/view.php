<?php
/**
 * One view of the Listen app on its own, for the app's script to put in place: the app's bar and
 * the view the address opens, with the document's title, and nothing of the theme. The app asks
 * for it with ?riff_part=view (Riff\Listen\App::part()); the page itself is never this.
 *
 * @package Riff
 */

use Riff\Listen\App;

defined( 'ABSPATH' ) || exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="robots" content="noindex">
<title><?php echo esc_html( wp_get_document_title() ); ?></title>
</head>
<body>
<?php echo App::render( array( 'align' => 'full' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the block's own markup, escaped where it is built. ?>
</body>
</html>
