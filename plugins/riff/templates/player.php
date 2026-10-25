<?php
/**
 * Player markup: the docked bar and Now Playing. Hidden until a track is loaded.
 *
 * The layout follows YouTube Music: on a phone, Now Playing is a full screen with the queue in a
 * sheet that peeks from the bottom; on a wide screen, the bar stays and Now Playing shows the art
 * beside an Up next panel. The wide bar is arranged as Tidal's, with the seek line under the
 * transport. Controls that appear in more than one place are separate buttons with the same
 * data-riff-action, and riff.js keeps every copy in step, so no control owns any state.
 *
 * @package Riff
 */

use Riff\Player;

defined( 'ABSPATH' ) || exit;

// phpcs:disable WordPress.Security.EscapeOutput.OutputNotEscaped -- Player::icon() returns static SVG shipped with the plugin.
?>
<div id="riff" class="riff" hidden<?php echo Player::root_style(); ?>>
	<section class="riff-bar" aria-label="<?php esc_attr_e( 'Player', 'riff' ); ?>">
		<button type="button" class="riff-bar-info" data-riff-action="open" aria-label="<?php esc_attr_e( 'Now Playing', 'riff' ); ?>" aria-haspopup="dialog">
			<span class="riff-thumb"><img data-riff-art alt="" decoding="async" hidden></span>
			<span class="riff-bar-text">
				<span class="riff-title" data-riff-text="title"></span>
				<span class="riff-sub" data-riff-text="subtitle"></span>
			</span>
		</button>
		<?php // On a wide screen the transport sits in the middle with the seek line under it, as Tidal has it. ?>
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
					<?php // The filament: the played part of the line is a wire that glows with the music (riff.js). ?>
					<span class="riff-line" aria-hidden="true"><i></i><i class="riff-wire" data-riff-wire></i><i class="riff-hot" data-riff-hot></i></span>
					<b class="riff-knob" aria-hidden="true"></b>
					<span class="riff-tip" aria-hidden="true" hidden></span>
					<input type="range" class="riff-seek" data-riff-seek min="0" max="1000" step="1" value="0" aria-label="<?php esc_attr_e( 'Track position', 'riff' ); ?>">
				</div>
				<span class="riff-time riff-desk" dir="ltr" data-riff-text="duration">0:00</span>
			</div>
		</div>
		<div class="riff-bar-end">
			<?php // The heart, on a phone beside Play as Spotify's mini player has it. Shown for a track in the Media Library. ?>
			<button type="button" class="riff-btn riff-like" data-riff-action="like" aria-label="<?php esc_attr_e( 'Like', 'riff' ); ?>" aria-pressed="false" hidden><?php echo Player::hearts(); ?></button>
			<?php // The player's areas, filled by Riff's own listeners: badges (the format and bit rate, a pill at the bar's right end, as Tidal sets its tier) and controls. ?>
			<span class="riff-area riff-desk" data-riff-area="badges"></span>
			<span class="riff-area riff-desk" data-riff-area="controls"></span>
			<button type="button" class="riff-btn riff-mobile" data-riff-action="cast" aria-label="<?php esc_attr_e( 'Play on another device', 'riff' ); ?>" hidden><?php echo Player::icon( 'cast' ); ?></button>
			<label class="riff-volume riff-desk">
				<input type="range" data-riff-volume min="0" max="100" step="1" value="100" aria-label="<?php esc_attr_e( 'Volume', 'riff' ); ?>" aria-valuetext="<?php esc_attr_e( '100 percent', 'riff' ); ?>">
				<?php echo Player::icon( 'volume' ); ?>
			</label>
			<button type="button" class="riff-btn riff-desk riff-chevron" data-riff-action="open" aria-hidden="true" tabindex="-1"><?php echo Player::icon( 'caret' ); ?></button>
		</div>
	</section>

	<div class="riff-np" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Now Playing', 'riff' ); ?>" hidden>
		<div class="riff-np-bg" aria-hidden="true"></div>
		<div class="riff-np-glow" data-riff-npglow aria-hidden="true"></div>
		<header class="riff-np-head">
			<button type="button" class="riff-btn" data-riff-action="close" aria-label="<?php esc_attr_e( 'Close Now Playing', 'riff' ); ?>"><?php echo Player::icon( 'down' ); ?></button>
			<div class="riff-modes" role="radiogroup" aria-label="<?php esc_attr_e( 'Song or video', 'riff' ); ?>" hidden>
				<button type="button" role="radio" data-riff-mode="song" aria-checked="true"><?php echo Player::icon( 'song' ); ?><span><?php esc_html_e( 'Song', 'riff' ); ?></span></button>
				<button type="button" role="radio" data-riff-mode="video" aria-checked="false"><?php echo Player::icon( 'video' ); ?><span><?php esc_html_e( 'Video', 'riff' ); ?></span></button>
			</div>
			<span class="riff-np-end">
				<?php // Captions, for a video version that has them, in video mode. ?>
				<button type="button" class="riff-btn riff-captions" data-riff-action="captions" aria-label="<?php esc_attr_e( 'Captions', 'riff' ); ?>" aria-pressed="false" hidden><?php echo Player::icon( 'captions' ); ?></button>
				<?php // Stop: what swiping the bar down does, as a button (WCAG 2.5.7). ?>
				<button type="button" class="riff-btn" data-riff-action="dismiss" aria-label="<?php esc_attr_e( 'Stop', 'riff' ); ?>"><?php echo Player::icon( 'stop' ); ?></button>
				<?php // The single-key shortcuts switch, the player's own setting: at the top of Now Playing on every width, out of the transport. ?>
				<button type="button" class="riff-btn" data-riff-action="shortcuts" aria-label="<?php esc_attr_e( 'Keyboard shortcuts', 'riff' ); ?>" aria-pressed="true"><?php echo Player::icon( 'keyboard' ); ?></button>
				<button type="button" class="riff-btn" data-riff-action="cast" aria-label="<?php esc_attr_e( 'Play on another device', 'riff' ); ?>" hidden><?php echo Player::icon( 'cast' ); ?></button>
			</span>
		</header>

		<?php /* With the queue fully open on a phone, the player shrinks to this row above it. */ ?>
		<div class="riff-np-mini">
			<span class="riff-thumb riff-thumb-lg"><img data-riff-art alt="" decoding="async" hidden></span>
			<span class="riff-bar-text">
				<span class="riff-title" data-riff-text="title"></span>
				<span class="riff-sub" data-riff-text="artist"></span>
			</span>
			<button type="button" class="riff-btn" data-riff-action="cast" aria-label="<?php esc_attr_e( 'Play on another device', 'riff' ); ?>" hidden><?php echo Player::icon( 'cast' ); ?></button>
			<button type="button" class="riff-btn riff-play" data-riff-action="toggle" aria-label="<?php esc_attr_e( 'Play', 'riff' ); ?>"><?php echo Player::icon( 'play' ) . Player::icon( 'pause' ); ?></button>
		</div>

		<div class="riff-np-body">
			<div class="riff-stage">
				<img class="riff-cover" data-riff-art data-riff-size="large" alt="" decoding="async" draggable="false" hidden>
				<video class="riff-video" playsinline preload="metadata"></video>
			</div>
			<div class="riff-np-panel">
				<div class="riff-np-meta">
					<button type="button" class="riff-btn riff-like" data-riff-action="like" aria-label="<?php esc_attr_e( 'Like', 'riff' ); ?>" aria-pressed="false" hidden><?php echo Player::hearts(); ?></button>
					<h2 class="riff-np-title" data-riff-text="title"></h2>
					<p class="riff-np-sub" data-riff-text="artist"></p>
					<p class="riff-np-quality riff-area" data-riff-area="badges"></p>
					<div class="riff-np-extras riff-area" data-riff-area="controls"></div>
				</div>
				<div class="riff-np-seek">
					<span class="riff-line" aria-hidden="true"><i></i></span>
					<input type="range" class="riff-seek" data-riff-seek min="0" max="1000" step="1" value="0" aria-label="<?php esc_attr_e( 'Track position', 'riff' ); ?>">
					<span class="riff-np-times" dir="ltr"><span data-riff-text="current">0:00</span><span data-riff-text="duration">0:00</span></span>
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
				</div>
			</div>

			<section class="riff-queue" id="riff-queue" aria-labelledby="riff-queue-tab">
				<?php /* A phone sees a handle and the source; a wide screen sees a tab. Both open the same list. */ ?>
				<button type="button" class="riff-peek" data-riff-action="queue" aria-expanded="false" aria-controls="riff-queue-list" aria-label="<?php esc_attr_e( 'Up next', 'riff' ); ?>">
					<i class="riff-handle" aria-hidden="true"></i>
					<span data-riff-text="source"></span>
				</button>
				<?php $riff_tabs = Player::tabs(); ?>
				<div class="riff-tabs<?php echo count( $riff_tabs ) > 1 ? ' riff-tabs-many' : ''; ?>" role="tablist">
					<?php foreach ( $riff_tabs as $riff_slug => $riff_tab ) : ?>
						<?php $riff_first = 'queue' === $riff_slug; ?>
						<button type="button" class="riff-tab" role="tab" id="<?php echo esc_attr( $riff_first ? 'riff-queue-tab' : 'riff-tab-' . $riff_slug ); ?>" data-riff-tab="<?php echo esc_attr( $riff_slug ); ?>" aria-controls="riff-panel-<?php echo esc_attr( $riff_slug ); ?>" aria-selected="<?php echo $riff_first ? 'true' : 'false'; ?>" tabindex="<?php echo $riff_first ? '0' : '-1'; ?>"><?php echo esc_html( $riff_tab['label'] ); ?></button>
					<?php endforeach; ?>
				</div>
				<div class="riff-panel riff-panel-queue" role="tabpanel" id="riff-panel-queue" aria-labelledby="riff-queue-tab" data-riff-panel="queue">
					<header class="riff-queue-head">
						<div>
							<p><?php esc_html_e( 'Playing from', 'riff' ); ?></p>
							<h3 data-riff-text="source"></h3>
						</div>
						<button type="button" class="riff-queue-clear" data-riff-action="clear-queue" aria-label="<?php esc_attr_e( 'Clear the queue', 'riff' ); ?>" hidden><?php esc_html_e( 'Clear', 'riff' ); ?></button>
					</header>
					<ol class="riff-queue-list" id="riff-queue-list"></ol>
				</div>
				<?php foreach ( array_slice( $riff_tabs, 1, null, true ) as $riff_slug => $riff_tab ) : ?>
					<div class="riff-panel" role="tabpanel" id="riff-panel-<?php echo esc_attr( $riff_slug ); ?>" aria-labelledby="riff-tab-<?php echo esc_attr( $riff_slug ); ?>" data-riff-panel="<?php echo esc_attr( $riff_slug ); ?>" tabindex="0" hidden></div>
				<?php endforeach; ?>
			</section>
		</div>
	</div>

	<p class="riff-toast" aria-hidden="true" hidden></p>
	<audio class="riff-audio" preload="metadata"></audio>
</div>
