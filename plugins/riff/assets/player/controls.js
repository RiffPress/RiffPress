/* Buttons. Controls that appear in more than one place are separate buttons with the same
 * data-riff-action, and every copy is kept in step by paint(), so no control owns any state. The
 * single-key shortcuts switch is the player's own setting, at the top of Now Playing on every
 * width, remembered on this device as the volume is. */
import { read, write, drop } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function controls( P ) {
	const { root, $$ } = P;

	P.shortcutsOn = read( localStorage, P.SHORTCUTS ) !== 'off';
	const shortcutsLabel = () =>
		P.shortcutsOn
			? __( 'Keyboard shortcuts on', 'riff' )
			: __( 'Keyboard shortcuts off', 'riff' );
	function paintShortcuts() {
		for ( const button of $$( '[data-riff-action="shortcuts"]' ) ) {
			button.setAttribute( 'aria-pressed', String( P.shortcutsOn ) );
			button.setAttribute( 'aria-label', shortcutsLabel() );
		}
	}
	paintShortcuts();

	root.addEventListener( 'click', ( e ) => {
		const mode = e.target.closest( '[data-riff-mode]' );
		if ( mode ) {
			P.setMode( mode.dataset.riffMode );
			return;
		}
		const button = e.target.closest( '[data-riff-action]' );
		if ( ! button || P.swiped ) {
			return;
		}
		const action = button.dataset.riffAction;
		if ( action === 'toggle' ) {
			P.toggle();
		} else if ( action === 'next' ) {
			P.next();
		} else if ( action === 'prev' ) {
			P.prev();
		} else if ( action === 'open' ) {
			if ( P.np.hidden ) {
				P.open();
			} else {
				P.close();
			}
		} else if ( action === 'close' ) {
			P.close();
		} else if ( action === 'shortcuts' ) {
			P.shortcutsOn = ! P.shortcutsOn;
			if ( P.shortcutsOn ) {
				drop( localStorage, P.SHORTCUTS );
			} else {
				write( localStorage, P.SHORTCUTS, 'off' );
			}
			paintShortcuts();
			P.toast( shortcutsLabel() );
		} else if ( action === 'queue' ) {
			P.sheet(
				{ none: 'half', half: 'full', full: 'none' }[ P.sheetState ]
			);
		} else if ( action === 'share' ) {
			P.feature( 'share' ).then( ( m ) => m?.share() );
		} else if ( action === 'repeat' ) {
			P.repeat = { off: 'all', all: 'one', one: 'off' }[ P.repeat ];
			P.paint();
			P.save();
		} else if ( action === 'shuffle' ) {
			P.shuffle = ! P.shuffle;
			const current = P.order[ P.pos ];
			if ( P.shuffle ) {
				P.reshuffle();
			} else {
				P.order = P.queue.map( ( _, i ) => i );
				P.pos = current;
			}
			P.renderQueue();
			P.paint();
			P.save();
		} else if ( action === 'cast' ) {
			P.cast?.();
		} else if ( action === 'like' ) {
			if ( P.inLibrary( P.track() ) ) {
				P.toggleLike( P.track() );
			}
		}
	} );

	return {};
}
