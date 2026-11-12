<?php
/**
 * The page the link in the email opens outside the browser that asked for the code: "Sign in to
 * the site?", with one button. A mail scanner that opens the link sees only this, and uses nothing
 * up; the button's POST is what checks the code (Sign_In::link()). Drawn as the sheet is, on the
 * player's surface, in Riff's tokens.
 *
 * @package Riff\SignIn
 */

// phpcs:set WordPress.WP.I18n text_domain[] riff-sign-in

use Riff\SignIn\Codes;
use Riff\SignIn\Sign_In;

defined( 'ABSPATH' ) || exit;

$riff_sign_in = Sign_In::asked();
/* translators: %s: the site's name. */
$riff_sign_in_title = sprintf( __( 'Sign in to %s?', 'riff-sign-in' ), $riff_sign_in['site'] );
/* translators: %s: the account's email address, with most of it hidden, as j•••@example.com. */
$riff_sign_in_heading = '' !== $riff_sign_in['who'] ? sprintf( __( 'Sign in as %s?', 'riff-sign-in' ), $riff_sign_in['who'] ) : $riff_sign_in_title;
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title><?php echo esc_html( $riff_sign_in_title ); ?></title>
<?php
if ( $riff_sign_in['tokens'] ) {
	wp_print_styles( 'riff-tokens' );
}
?>
<style><?php echo wp_strip_all_tags( $riff_sign_in['css'] ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- the plugin's own static styles. ?></style>
</head>
<body id="riff" class="riff-signin-page">
<main class="riff-signin" aria-labelledby="riff-signin-title">
	<h1 id="riff-signin-title"><?php echo esc_html( $riff_sign_in_heading ); ?></h1>
	<p>
	<?php
	/* translators: %s: the site's name. */
	echo esc_html( sprintf( __( 'You opened the link in a sign-in email from %s. Press Sign in to finish signing in to that account on this device.', 'riff-sign-in' ), $riff_sign_in['site'] ) );
	?>
	</p>
	<?php if ( ! $riff_sign_in['here'] ) : ?>
	<p class="riff-signin-warning" role="alert"><strong><?php esc_html_e( 'No code was asked for from this browser.', 'riff-sign-in' ); ?></strong> <?php esc_html_e( 'If you did not ask for one on another device, do not press Sign in: someone may have sent you a link to their own account.', 'riff-sign-in' ); ?></p>
	<?php endif; ?>
	<form method="post" action="<?php echo esc_url( $riff_sign_in['action'] ); ?>">
		<input type="hidden" name="<?php echo esc_attr( Codes::QUERY ); ?>" value="<?php echo esc_attr( $riff_sign_in['value'] ); ?>">
		<div class="riff-signin-row">
			<button type="submit" class="riff-signin-main"><?php esc_html_e( 'Sign in', 'riff-sign-in' ); ?></button>
		</div>
	</form>
	<p class="riff-signin-note"><?php esc_html_e( 'If you did not ask to sign in, close this page.', 'riff-sign-in' ); ?></p>
</main>
</body>
</html>
<?php
// phpcs:set WordPress.WP.I18n text_domain[] riff
