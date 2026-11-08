<?php
/**
 * Riff's functions for other plugins, beside its classes: registering the player's controls,
 * views and keyboard shortcuts, as WordPress registers blocks and settings.
 *
 * @since 5.8.0
 * @package Riff
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers a control in the player's bar. Call it on the `riff_register` action.
 *
 * @since 5.8.0
 *
 * @see Riff\Registry::register_control() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The control.
 * @return bool Whether it was registered.
 */
function riff_register_control( string $id, array $args = array() ): bool {
	return Riff\Registry::register_control( $id, $args );
}

/**
 * Takes a control away, Riff's own included.
 *
 * @since 5.8.0
 *
 * @param string $id The control's id.
 * @return bool Whether there was one.
 */
function riff_unregister_control( string $id ): bool {
	return Riff\Registry::unregister_control( $id );
}

/**
 * Registers a view the listener opens from its button in the bar: a screen of Now Playing, or a
 * panel beside the page. Call it on the `riff_register` action.
 *
 * @since 5.8.0
 *
 * @see Riff\Registry::register_view() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The view.
 * @return bool Whether it was registered.
 */
function riff_register_view( string $id, array $args = array() ): bool {
	return Riff\Registry::register_view( $id, $args );
}

/**
 * Takes a view away, Riff's own included.
 *
 * @since 5.8.0
 *
 * @param string $id The view's id.
 * @return bool Whether there was one.
 */
function riff_unregister_view( string $id ): bool {
	return Riff\Registry::unregister_view( $id );
}

/**
 * Registers a key the player acts on for a plugin. It follows Riff's own single-key shortcuts: it
 * does nothing while the listener types, it is listed with them on the listener's profile, and it
 * is off wherever they are off. Call it on the `riff_register` action, and give it what it does
 * with `window.riff.shortcut()`.
 *
 * @since 5.9.0
 *
 * @see Riff\Registry::register_shortcut() for the arguments.
 *
 * @param string $id   Lowercase letters, digits and dashes.
 * @param array  $args The shortcut: its `key` and its `label`.
 * @return bool Whether it was registered.
 */
function riff_register_shortcut( string $id, array $args = array() ): bool {
	return Riff\Registry::register_shortcut( $id, $args );
}

/**
 * The site's Listen page, where the player opens as an app: the oldest published page holding the
 * Riff block or using the Listen template.
 *
 * @since 6.5.0
 *
 * @return int Page ID, or 0 when there is none.
 */
function riff_listen_page(): int {
	return Riff\Listen\First_Run::listen_page();
}
