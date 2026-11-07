<?php
/**
 * What the editor script needs. Written by hand: there is no build step.
 *
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

return array(
	'dependencies' => array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render' ),
	'version'      => RIFF_VERSION,
);
