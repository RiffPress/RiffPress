<?php
/**
 * Renders the Riff block on the front end.
 *
 * @package Riff
 *
 * @var array $attributes Block attributes.
 */

defined( 'ABSPATH' ) || exit;

echo Riff\Listen\App::render( $attributes, true ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped where it is built.
