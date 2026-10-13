<?php
/**
 * Removes what Riff stored: the video-version link on audio files. Artwork set through Riff is the
 * file's featured image, which is WordPress's own and stays.
 *
 * @package Riff
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_post_meta_by_key( '_riff_video' );
