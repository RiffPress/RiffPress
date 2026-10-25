/* Buttons. Controls that appear in more than one place are separate buttons with the same
 * data-riff-action, and every copy is kept in step by paint(), so no control owns any state.
 * Whether the single-key shortcuts act is the listener's choice on their profile (Shortcuts in
 * PHP), sent with the page: a visitor has none. */
import { read, write } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function controls( P ) {
	const { root } = P;

	P.shortcutsOn = P.data.shortcuts === true;
	P.captionsOn = read( localStorage, P.CAPTIONS ) === 'on';

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
		} else if ( action === 'dismiss' ) {
			P.dismiss();
		} else if ( action === 'captions' ) {
			P.captionsOn = ! P.captionsOn;
			write( localStorage, P.CAPTIONS, P.captionsOn ? 'on' : 'off' );
			P.paintCaptions();
			P.toast(
				P.captionsOn
					? __( 'Captions on', 'riff' )
					: __( 'Captions off', 'riff' )
			);
		} else if ( action === 'close' ) {
			P.close();
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
