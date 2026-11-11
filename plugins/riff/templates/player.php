<?php
/**
 * Player markup: the docked bar and Now Playing. Hidden until a track is loaded.
 *
 * Now Playing is a view at a time, each taking the whole screen above the bar: the album, which the
 * bar itself opens, the cover where Now Playing is portrait and the
 * turntable where it is landscape; and any other a plugin registers, such as the lyrics, from its button at the right of the bar. Up next is a panel beside the page. The bar's controls and
 * the views are registered on the server (Riff\Registry) and drawn here, before any script; the
 * script brings each to life by its id. The wide bar has the seek line under the transport.
 * Controls that appear in more than one place are separate buttons with the same
 * data-riff-action, and paint.js keeps every copy in step, so no control owns any state.
 *
 * @package Riff
 */

use Riff\Player;
use Riff\Registry;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped -- Player::icon() returns static SVG shipped with the plugin, and Registry escapes what it draws.
?>
<?php // Now Playing opens to the album: the cover, or the turntable where Now Playing is landscape (now-playing.js). ?>
<div id="riff" class="riff" hidden<?php echo Player::root_style(); ?> data-riff-showing="album" data-riff-turntable="off">
	<section class="riff-bar" aria-label="<?php esc_attr_e( 'Player', 'riff' ); ?>">
		<?php // What plays, which opens Now Playing, as a tap anywhere on the bar but its controls does (controls.js). Named by the track after a word only a screen reader hears; "dialog pop up" says it opens. ?>
		<button type="button" class="riff-bar-info" data-riff-action="open" aria-haspopup="dialog" aria-expanded="false">
			<span class="riff-app-sr"><?php esc_html_e( 'Now Playing', 'riff' ); ?>, </span>
			<span class="riff-thumb"><img data-riff-art alt="" decoding="async" hidden></span>
			<span class="riff-bar-text">
				<span class="riff-title" data-riff-text="title"></span><span class="riff-app-sr">, </span>
				<span class="riff-sub" data-riff-text="subtitle"></span>
			</span>
		</button>
		<?php // On a wide screen the transport sits in the middle with the seek line under it. ?>
		<div class="riff-bar-center">
			<div class="riff-bar-transport">
				<button type="button" class="riff-btn riff-desk riff-mode" data-riff-action="shuffle" aria-label="<?php esc_attr_e( 'Shuffle', 'riff' ); ?>" aria-pressed="false"><?php echo Player::icon( 'shuffle' ); ?></button>
				<button type="button" class="riff-btn riff-desk riff-skip-sm" data-riff-action="prev" aria-label="<?php esc_attr_e( 'Previous', 'riff' ); ?>"><?php echo Player::icon( 'prev' ); ?></button>
				<button type="button" class="riff-btn riff-play" data-riff-action="toggle" aria-label="<?php esc_attr_e( 'Play', 'riff' ); ?>"><?php echo Player::icon( 'play' ) . Player::icon( 'pause' ); ?></button>
				<button type="button" class="riff-btn riff-desk riff-skip-sm" data-riff-action="next" aria-label="<?php esc_attr_e( 'Next', 'riff' ); ?>"><?php echo Player::icon( 'next' ); ?></button>
				<button type="button" class="riff-btn riff-desk riff-mode" data-riff-action="repeat" data-repeat="off" aria-label="<?php esc_attr_e( 'Repeat, off', 'riff' ); ?>"><?php echo Player::icon( 'repeat' ) . Player::icon( 'repeatOne' ); ?></button>
			</div>
			<div class="riff-bar-progress">
				<?php // Times read left to right in every language. ?>
				<span class="riff-time riff-desk" dir="ltr" data-riff-text="current">0:00</span>
				<div class="riff-bar-seek">
					<span class="riff-line" aria-hidden="true"><i></i></span>
					<b class="riff-knob" aria-hidden="true"></b>
					<span class="riff-tip" aria-hidden="true" hidden></span>
					<input type="range" class="riff-seek" data-riff-seek min="0" max="1000" step="1" value="0" aria-label="<?php esc_attr_e( 'Track position', 'riff' ); ?>">
				</div>
				<span class="riff-time riff-desk" dir="ltr" data-riff-text="duration">0:00</span>
			</div>
		</div>
		<div class="riff-bar-end">
			<?php // The controls and the views' buttons, each registered on the server, Riff's own as any other's (Riff\Registry). ?>
			<span class="riff-controls" data-riff-controls><?php echo Registry::bar(); ?></span>
		</div>
	</section>

	<div class="riff-np" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Now Playing', 'riff' ); ?>" hidden>
		<div class="riff-np-bg" aria-hidden="true"></div>
		<header class="riff-np-head">
			<?php // Close, on a phone; and the one way out drawn on the desk where the deck is on its own, there only while the listener moves (riff.css, now-playing.js). ?>
			<button type="button" class="riff-btn" data-riff-action="close" aria-label="<?php esc_attr_e( 'Close Now Playing', 'riff' ); ?>"><?php echo Player::icon( 'down' ); ?></button>
			<div class="riff-modes" role="radiogroup" aria-label="<?php esc_attr_e( 'Song or video', 'riff' ); ?>" hidden>
				<button type="button" role="radio" data-riff-mode="song" aria-checked="true"><?php echo Player::icon( 'song' ); ?><span><?php esc_html_e( 'Song', 'riff' ); ?></span></button>
				<button type="button" role="radio" data-riff-mode="video" aria-checked="false"><?php echo Player::icon( 'video' ); ?><span><?php esc_html_e( 'Video', 'riff' ); ?></span></button>
			</div>
			<span class="riff-np-end">
				<?php // Captions, for a video version that has them, in video mode. ?>
				<button type="button" class="riff-btn riff-captions" data-riff-action="captions" aria-label="<?php esc_attr_e( 'Captions', 'riff' ); ?>" aria-pressed="false" hidden><?php echo Player::icon( 'captions' ); ?></button>
			</span>
		</header>

		<div class="riff-np-body">
			<div class="riff-stage">
				<?php /* The turntable, which stays where it stands: its plinth and platter under the record, with the rest the arm sits on, and its tonearm over it, which can be moved to any band of the side, as a press on the record's grooves moves it (the cue, under the arm), with the anti-skate dial beside its base and the pop-up target light by the platter. The tube's path and the headshell's angle are drawn by now-playing.js from the arm's alignment. The record in the sleeve comes out onto it while the album plays, its label printed in the cover's colours with the album above the spindle and the artist below, as a record's is. */ ?>
				<span class="riff-plinth riff-deck-part" aria-hidden="true"><span class="riff-strobe"><span class="riff-strobe-room"><i class="riff-turns"></i></span><span class="riff-strobe-lamp"><i></i><i></i></span></span><span class="riff-armrest"></span><span class="riff-antiskate"></span><span class="riff-target"></span></span>
				<span class="riff-record" aria-hidden="true"><span class="riff-wax riff-turns"><svg viewBox="0 0 100 100" focusable="false"><defs><path id="riff-runout" d="M50 50m-18.6 0a18.6 18.6 0 1 1 37.2 0a18.6 18.6 0 1 1-37.2 0"/></defs><text><textPath href="#riff-runout" data-riff-etch></textPath></text></svg></span><span class="riff-spin riff-turns"><span class="riff-label"><b data-riff-text="source"></b><i data-riff-text="artist"></i><ol class="riff-label-tracks"></ol><small>33⅓</small></span></span></span>
				<span class="riff-mount riff-deck-part" inert><span class="riff-cue"></span><span class="riff-arm" role="slider" tabindex="0" aria-label="<?php esc_attr_e( 'Tonearm', 'riff' ); ?>" aria-valuemin="1" aria-valuemax="1" aria-valuenow="1"><svg class="riff-arm-tube" viewBox="0 0 12 82" focusable="false" aria-hidden="true"><use class="riff-arm-lift" href="#riff-arm-body"/><g id="riff-arm-body"><rect x="2.6" y="-10" width="6.8" height="7" rx="1.2" fill="#3a3a3a" stroke="#5e5e5e" stroke-width=".4"/><path class="riff-arm-wand" fill="none" stroke="#cfcfcf" stroke-width="1.1" stroke-linecap="round"/><g class="riff-headshell"><rect x="-2.4" y="-8.6" width="4.8" height="9.9" rx="1" fill="#1d1d1d" stroke="#4a4a4a" stroke-width=".4"/><rect x="-1.5" y="-4.2" width="3" height="4.4" rx=".4" fill="#2c2c2c"/><path d="M2.4 -7.4l1.5-0.9" fill="none" stroke="#4a4a4a" stroke-width=".6" stroke-linecap="round"/></g></g><path class="riff-arm-grip" fill="none" stroke="transparent" stroke-width="7"/></svg><svg class="riff-arm-base" viewBox="0 0 12 82" focusable="false" aria-hidden="true"><circle cx="6" cy="4" r="4" fill="#2a2a2a" stroke="#5a5a5a" stroke-width=".6"/><circle cx="6" cy="4" r="1.4" fill="#8a8a8a"/></svg></span></span>
				<?php /* The deck's own keys, along the front of its plinth: start and stop, the two speeds (an LP at 45 runs fast, as on a deck), the track before and after, and shuffle and repeat, each with its lamp. Beside them, the deck's display (level.js): the band and the time, the speed, and the music's level. While the record is out in Now Playing they are the transport: the deck is all there is on the screen, with no bar (riff.css). A touch screen on its side has the deck's board in their place. */ ?>
				<span class="riff-keys riff-deck-part" role="group" aria-label="<?php esc_attr_e( 'Turntable', 'riff' ); ?>">
					<button type="button" class="riff-key-start" data-riff-action="toggle" aria-label="<?php esc_attr_e( 'Play', 'riff' ); ?>"><span aria-hidden="true"><?php esc_html_e( 'Start · Stop', 'riff' ); ?></span></button>
					<span class="riff-speeds" role="radiogroup" aria-label="<?php esc_attr_e( 'Speed', 'riff' ); ?>">
						<button type="button" class="riff-key-33" role="radio" data-riff-speed="33" aria-checked="true" aria-label="<?php esc_attr_e( '33⅓ revolutions per minute', 'riff' ); ?>">33</button>
						<button type="button" class="riff-key-45" role="radio" data-riff-speed="45" aria-checked="false" aria-label="<?php esc_attr_e( '45 revolutions per minute', 'riff' ); ?>">45</button>
					</span>
					<button type="button" class="riff-key-prev" data-riff-action="prev" aria-label="<?php esc_attr_e( 'Previous', 'riff' ); ?>"><?php echo Player::icon( 'prev' ); ?></button>
					<button type="button" class="riff-key-next" data-riff-action="next" aria-label="<?php esc_attr_e( 'Next', 'riff' ); ?>"><?php echo Player::icon( 'next' ); ?></button>
					<button type="button" class="riff-key-shuffle" data-riff-action="shuffle" aria-label="<?php esc_attr_e( 'Shuffle', 'riff' ); ?>" aria-pressed="false"><?php echo Player::icon( 'shuffle' ); ?></button>
					<button type="button" class="riff-key-repeat" data-riff-action="repeat" data-repeat="off" aria-label="<?php esc_attr_e( 'Repeat, off', 'riff' ); ?>"><?php echo Player::icon( 'repeat' ) . Player::icon( 'repeatOne' ); ?></button>
					<?php // The deck's level meter, in a window beside its keys (level.js). ?>
					<canvas class="riff-level" aria-hidden="true"></canvas>
					<span class="riff-pitch">
						<input type="range" min="-8" max="8" step="0.1" value="0" data-riff-pitch aria-label="<?php esc_attr_e( 'Pitch', 'riff' ); ?>" aria-valuetext="0%">
						<output aria-hidden="true">0.0</output>
					</span>
				</span>
				<img class="riff-cover" data-riff-art data-riff-size="large" alt="" decoding="async" draggable="false" hidden>
				<?php // The sleeve on the desk, which a pointer taps; this is it for a keyboard and a screen reader. ?>
				<button type="button" class="riff-sleeve"><?php esc_html_e( 'Play the record', 'riff' ); ?></button>
				<video class="riff-video" playsinline preload="metadata"></video>
			</div>
			<?php // The place under the deck, for what a plugin adds. ?>
			<div class="riff-turntable-extras">
				<?php
				/**
				 * Fires in the place under the turntable, for what a plugin shows beside the record.
				 * Print one element for each thing: the place takes room only while one that isn't
				 * hidden is in it, and only where the turntable is the view. The record is out when
				 * `#riff` has `data-riff-deck="out"`. Script it from there; `window.riff.analyser()`
				 * hears the music.
				 *
				 * @since 6.3.0
				 */
				do_action( 'riff_below_turntable' );
				?>
			</div>
			<?php // The screens with a region of their own, such as the lyrics, each in the stage's place while it shows. ?>
			<?php echo Registry::screens(); ?>
			<div class="riff-np-panel">
				<?php // The sleeve, stood in the rack as a record shop shows what is playing, once the record is out on the deck. ?>
				<span class="riff-rack" aria-hidden="true"><img data-riff-art data-riff-size="large" alt="" decoding="async" hidden></span>
				<div class="riff-np-meta">
					<button type="button" class="riff-btn riff-like" data-riff-action="like" aria-label="<?php esc_attr_e( 'Like', 'riff' ); ?>" aria-pressed="false" hidden><?php echo Player::hearts(); ?></button>
					<h2 class="riff-np-title" data-riff-text="title"></h2>
					<p class="riff-np-sub" data-riff-text="artist"></p>
					<p class="riff-np-quality riff-area" data-riff-area="badges"></p>
				</div>
				<div class="riff-np-seek">
					<span class="riff-line" aria-hidden="true"><i></i></span>
					<input type="range" class="riff-seek" data-riff-seek min="0" max="1000" step="1" value="0" aria-label="<?php esc_attr_e( 'Track position', 'riff' ); ?>">
					<?php // On a phone the badges are small print between the times under the seek line, rather than a capsule on a row of their own. ?>
					<span class="riff-np-times" dir="ltr"><span data-riff-text="current">0:00</span><span class="riff-np-tier riff-area riff-mobile" data-riff-area="badges"></span><span data-riff-text="duration">0:00</span></span>
				</div>
				<div class="riff-np-controls">
					<button type="button" class="riff-btn" data-riff-action="shuffle" aria-label="<?php esc_attr_e( 'Shuffle', 'riff' ); ?>" aria-pressed="false"><?php echo Player::icon( 'shuffle' ); ?></button>
					<button type="button" class="riff-btn riff-skip" data-riff-action="prev" aria-label="<?php esc_attr_e( 'Previous', 'riff' ); ?>"><?php echo Player::icon( 'prev' ); ?></button>
					<button type="button" class="riff-btn riff-play riff-play-big" data-riff-action="toggle" aria-label="<?php esc_attr_e( 'Play', 'riff' ); ?>"><?php echo Player::icon( 'play' ) . Player::icon( 'pause' ); ?></button>
					<button type="button" class="riff-btn riff-skip" data-riff-action="next" aria-label="<?php esc_attr_e( 'Next', 'riff' ); ?>"><?php echo Player::icon( 'next' ); ?></button>
					<button type="button" class="riff-btn" data-riff-action="repeat" data-repeat="off" aria-label="<?php esc_attr_e( 'Repeat, off', 'riff' ); ?>"><?php echo Player::icon( 'repeat' ) . Player::icon( 'repeatOne' ); ?></button>
				</div>
				<div class="riff-chips">
					<?php foreach ( Player::chips() as $riff_slug => $riff_chip ) : ?>
						<?php echo Player::control( (string) $riff_slug, $riff_chip, 'riff-chip' ); ?>
					<?php endforeach; ?>
					<?php // On a phone, a chip for each view, which opens it from Now Playing; a wide screen has their buttons in the bar. ?>
					<?php echo Registry::chips(); ?>
				</div>
			</div>

		</div>
	</div>

	<?php /* The panels beside the page, each a view registered on the server: Up next, Riff's own, and any a plugin adds. One shows at a time, beside the page on a wide screen, over everything on a phone. */ ?>
	<aside class="riff-side" aria-labelledby="riff-side-title" hidden>
		<header class="riff-side-head">
			<h2 class="riff-side-title" id="riff-side-title" tabindex="-1"></h2>
			<button type="button" class="riff-btn riff-side-close" data-riff-action="close-panel" aria-label="<?php esc_attr_e( 'Close', 'riff' ); ?>"><?php echo Player::icon( 'close' ); ?></button>
		</header>
		<?php echo Registry::panels(); ?>
	</aside>

	<p class="riff-toast" aria-hidden="true" hidden></p>
	<audio class="riff-audio" preload="metadata"></audio>
</div>
