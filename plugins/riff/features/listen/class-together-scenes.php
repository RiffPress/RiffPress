<?php
/**
 * Listening together in Presence Scenes: steps that play a listener from the server.
 *
 * @since 5.8.0
 * @package Riff
 */

namespace Riff\Listen;

use Riff\Library;
use RuntimeException;
use WP_Post;

defined( 'ABSPATH' ) || exit;

/**
 * Presence Scenes, beside the Presence API, plays users through situations from the server, so one
 * browser can watch several people. Riff gives it steps a listener takes, each played as the actor
 * through the same PHP as the player's POST /together, and a folder of scenes that use them. A
 * listener is played on a track named by its title, from the published post it belongs to:
 *
 * | Step | Fields | What the actor does |
 * | --- | --- | --- |
 * | `riffPlay` | `text`: a track's title | Plays the post that track is on, from that track |
 * | `riffPause` | | Pauses where they are |
 * | `riffResume` | | Plays on |
 * | `riffSkip` | | Goes on to the next track |
 * | `riffSeek` | `text`: seconds | Moves to that point in the track |
 * | `riffStop` | | Stops sharing |
 *
 * The hooks do nothing without Presence Scenes, which is for demos and tests and never needed.
 */
final class Together_Scenes {

	/**
	 * Hooks the steps and the folder.
	 *
	 * @since 5.8.0
	 */
	public static function register(): void {
		add_filter( 'wp_presence_scene_steps', array( self::class, 'steps' ) );
		add_filter( 'wp_presence_scene_libraries', array( self::class, 'libraries' ) );
	}

	/**
	 * Riff's folder of scenes.
	 *
	 * @since 5.8.0
	 *
	 * @param string[] $folders The folders so far.
	 * @return string[]
	 */
	public static function libraries( $folders ) {
		$folders   = (array) $folders;
		$folders[] = __DIR__ . '/scenes';
		return $folders;
	}

	/**
	 * Riff's steps.
	 *
	 * @since 5.8.0
	 *
	 * @param array[] $steps The steps so far.
	 * @return array[]
	 */
	public static function steps( $steps ) {
		$steps             = (array) $steps;
		$steps['riffPlay'] = array(
			'callback' => array( self::class, 'play' ),
			'fields'   => array( 'text' ),
			/* translators: 1: Actor, 2: Track title. */
			'label'    => __( '%1$s plays “%2$s”', 'riff' ),
		);
		$steps['riffPause'] = array(
			'callback' => array( self::class, 'pause' ),
			/* translators: %s: Actor. */
			'label'    => __( '%s pauses', 'riff' ),
		);
		$steps['riffResume'] = array(
			'callback' => array( self::class, 'resume' ),
			/* translators: %s: Actor. */
			'label'    => __( '%s plays on', 'riff' ),
		);
		$steps['riffSkip'] = array(
			'callback' => array( self::class, 'skip' ),
			/* translators: %s: Actor. */
			'label'    => __( '%s skips to the next track', 'riff' ),
		);
		$steps['riffSeek'] = array(
			'callback' => array( self::class, 'seek' ),
			'fields'   => array( 'text' ),
			/* translators: 1: Actor, 2: Seconds. */
			'label'    => __( '%1$s moves to %2$s seconds', 'riff' ),
		);
		$steps['riffStop'] = array(
			'callback' => array( self::class, 'stop' ),
			/* translators: %s: Actor. */
			'label'    => __( '%s stops sharing', 'riff' ),
		);
		return $steps;
	}

	/**
	 * Plays the post a track is on, from that track.
	 *
	 * @since 5.8.0
	 *
	 * @param object $actor  The actor, the current user.
	 * @param array  $fields `text`: the track's title.
	 * @throws RuntimeException When there is no such track on a published post.
	 */
	public static function play( $actor, array $fields ): void {
		$title = (string) ( $fields['text'] ?? '' );
		foreach ( get_posts(
			array(
				'post_type'        => 'attachment',
				'post_mime_type'   => 'audio',
				'post_status'      => 'inherit',
				'title'            => $title,
				'orderby'          => 'ID',
				'order'            => 'DESC',
				'numberposts'      => 10,
				'suppress_filters' => false,
			)
		) as $track ) {
			$post = get_post( $track->post_parent );
			if ( ! $post instanceof WP_Post || 'publish' !== $post->post_status ) {
				continue;
			}
			$queue = array_values(
				array_filter(
					array_map(
						static fn( $t ) => array(
							'id'   => (int) ( $t['id'] ?? 0 ),
							'post' => $post->ID,
						),
						Library::tracks( $post )
					),
					static fn( $item ) => $item['id'] > 0
				)
			);
			$index = array_search( $track->ID, array_column( $queue, 'id' ), true );
			if ( false !== $index ) {
				// Held at its start until the change is due, as a host's press is while followed.
				self::share( $queue, (int) $index, 0.0, true, false );
				return;
			}
		}
		throw new RuntimeException( esc_html( sprintf( 'No track called “%s” on a published post.', $title ) ) );
	}

	/**
	 * Pauses where the actor is, once the change is due: the music plays on until then.
	 *
	 * @since 5.8.0
	 */
	public static function pause(): void {
		$was = self::was();
		self::share( $was['queue'], (int) $was['index'], self::where( $was ), false, true );
	}

	/**
	 * Plays on from where the actor paused, once the change is due.
	 *
	 * @since 5.8.0
	 */
	public static function resume(): void {
		$was = self::was();
		self::share( $was['queue'], (int) $was['index'], self::where( $was ), true, false );
	}

	/**
	 * Goes on to the next track.
	 *
	 * @since 5.8.0
	 *
	 * @throws RuntimeException On the last track.
	 */
	public static function skip(): void {
		$was  = self::was();
		$next = (int) $was['index'] + 1;
		if ( $next >= count( $was['queue'] ) ) {
			throw new RuntimeException( 'Already on the last track.' );
		}
		// The next track held at its start until the change is due.
		self::share( $was['queue'], $next, 0.0, (bool) $was['playing'], false );
	}

	/**
	 * Moves to a point in the track.
	 *
	 * @since 5.8.0
	 *
	 * @param object $actor  The actor, the current user.
	 * @param array  $fields `text`: seconds.
	 */
	public static function seek( $actor, array $fields ): void {
		$was = self::was();
		// Playing, the music runs on from the new point until the change is due, as a host's seek does.
		self::share( $was['queue'], (int) $was['index'], max( 0.0, (float) ( $fields['text'] ?? 0 ) ), (bool) $was['playing'], (bool) $was['playing'] );
	}

	/**
	 * Stops sharing.
	 *
	 * @since 5.8.0
	 */
	public static function stop(): void {
		wp_presence_leave( Together::ROOM, Together::PREFIX . get_current_user_id(), array( 'client_prefix' => Together::PREFIX ) );
	}

	/**
	 * What the actor last shared.
	 *
	 * @return array
	 * @throws RuntimeException When they haven't shared anything.
	 */
	private static function was(): array {
		$was = Together::shared( get_current_user_id() );
		if ( ! $was || empty( $was['queue'] ) ) {
			throw new RuntimeException( 'Nothing is playing to change.' );
		}
		return $was;
	}

	/**
	 * Where the actor's music is now, by their schedule: where it is at `since`, and the time
	 * between then and now if it plays.
	 *
	 * @param array $was What they shared.
	 * @return float Seconds.
	 */
	private static function where( array $was ): float {
		$at = (float) ( $was['at'] ?? 0 );
		if ( ! empty( $was['playing'] ) ) {
			$at += ( microtime( true ) * 1000 - (float) ( $was['since'] ?? 0 ) ) / 1000;
		}
		return max( 0.0, $at );
	}

	/**
	 * Shares as the actor, or fails the step.
	 *
	 * @param array[] $queue   The queue.
	 * @param int     $index   Which plays.
	 * @param float   $at      Where it is.
	 * @param bool    $playing Whether it plays from the change on.
	 * @param bool    $running Whether it plays until the change is due.
	 * @throws RuntimeException When it can't be shared.
	 */
	private static function share( array $queue, int $index, float $at, bool $playing, bool $running ): void {
		$done = Together::share( get_current_user_id(), $queue, $index, $at, $playing, $running );
		if ( is_wp_error( $done ) ) {
			throw new RuntimeException( esc_html( $done->get_error_message() ) );
		}
	}
}
