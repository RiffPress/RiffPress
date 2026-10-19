<?php
/**
 * Riff Lyrics code with Riff's text domain. Expect: WordPress.WP.I18n.TextDomainMismatch
 *
 * @package Riff\Lyrics
 */

// phpcs:set WordPress.WP.I18n text_domain[] riff-lyrics
echo esc_html__( 'Lyrics', 'riff' );
