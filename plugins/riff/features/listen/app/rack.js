/* The albums as a shelf. The Albums view is a grid of covers; its switch stands the same cards side
 * by side as records in a rack, each turned to show its spine, the album's name on a colour taken
 * from its cover. Resting the pointer on one, or tabbing to it, turns it to face you: a pointer
 * sweeping straight across opens nothing, once one is open the next opens almost at once, and the
 * one open closes a moment after the pointer leaves the shelf, so opening one never slides the next
 * under the pointer and opens that too. The cards are the grid's own, links and all, so the view
 * reads and works the same either way; the spines are decoration and hidden from assistive
 * technology. The choice is kept on this device.
 *
 * Opening an album, from the shelf or the grid, carries its cover to its place at the head of the
 * album's page: the two share a view-transition name across the swap views.js animates, and the
 * browser moves the one into the other. */
import { average, read, write } from 'riff-app/helpers';

const KEY = 'riff-rack';
// WordPress's own: its category squares for the grid, and for the shelf its gallery, one cover
// faced with another behind it, unlike the library's upright bars in the sidebar.
const GRID =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.75 6C4.75 5.30964 5.30964 4.75 6 4.75H9C9.69036 4.75 10.25 5.30964 10.25 6V9C10.25 9.69036 9.69036 10.25 9 10.25H6C5.30964 10.25 4.75 9.69036 4.75 9V6Z"/><path d="M4.75 15C4.75 14.3096 5.30964 13.75 6 13.75H9C9.69036 13.75 10.25 14.3096 10.25 15V18C10.25 18.6904 9.69036 19.25 9 19.25H6C5.30964 19.25 4.75 18.6904 4.75 18V15Z"/><path d="M13.75 6C13.75 5.30964 14.3096 4.75 15 4.75H18C18.6904 4.75 19.25 5.30964 19.25 6V9C19.25 9.69036 18.6904 10.25 18 10.25H15C14.3096 10.25 13.75 9.69036 13.75 9V6Z"/><path d="M13.75 15C13.75 14.3096 14.3096 13.75 15 13.75H18C18.6904 13.75 19.25 14.3096 19.25 15V18C19.25 18.6904 18.6904 19.25 18 19.25H15C14.3096 19.25 13.75 18.6904 13.75 18V15Z"/></svg>';
const SHELF =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.25 6.75V19C20.25 19.6904 19.6904 20.25 19 20.25H6.75"/><path d="M17.25 12.596L14.2948 9.6397C14.2558 9.60064 14.1925 9.60063 14.1534 9.63969L10.5584 13.2347C10.5245 13.2686 10.4713 13.2737 10.4316 13.2469L7.39239 11.1909C7.35761 11.1674 7.31184 11.1681 7.27781 11.1927L3.75 13.7408M17.25 12.596V5C17.25 4.30964 16.6904 3.75 16 3.75H5C4.30964 3.75 3.75 4.30964 3.75 5V13.7408M17.25 12.596V16C17.25 16.6904 16.6904 17.25 16 17.25H5C4.30964 17.25 3.75 16.6904 3.75 16V13.7408"/></svg>';

export function rack( ctx ) {
	const { view, __ } = ctx;

	// A spine in its cover's colour, with dark words on a light one. A cover that cannot be read
	// leaves the spine dark.
	function colourOf( img, spine ) {
		average( img?.currentSrc || img?.src ).then( ( c ) => {
			if ( c ) {
				spine.style.setProperty(
					'--riff-spine',
					`rgb(${ Math.round( c.r ) } ${ Math.round( c.g ) } ${ Math.round( c.b ) })`
				);
				spine.classList.toggle( 'is-light', c.light );
			}
		} );
	}

	// The spines, for the cards that have none yet.
	function spines( grid ) {
		for ( const card of grid.querySelectorAll( '.riff-card' ) ) {
			const art = card.querySelector( '.riff-card-art' );
			if ( ! art || art.querySelector( '.riff-spine' ) ) {
				continue;
			}
			const spine = document.createElement( 'span' );
			spine.className = 'riff-spine';
			spine.setAttribute( 'aria-hidden', 'true' );
			const title = document.createElement( 'b' );
			title.textContent =
				card.querySelector( '.riff-card-title' )?.textContent || '';
			spine.append( title );
			art.append( spine );
			colourOf( art.querySelector( 'img' ), spine );
		}
	}

	// The Albums view's grid: the one straight under the view's title, whose cards open albums. An
	// album's page has album cards too, in More by this artist, under its own header.
	const albums = () => {
		const grid = view.querySelector( '.riff-app-title + .riff-grid' );
		return grid?.querySelector( '.riff-card[data-riff-album]' )
			? grid
			: null;
	};

	// Which record is turned out: the one the pointer has rested on, until it rests on another or
	// leaves the shelf. The first wants a moment's rest; after that the shelf is being browsed, and
	// the next follows the pointer with only enough wait to skip the ones it crosses at speed.
	const REST = 70;
	const BROWSE = 30;
	const LEAVE = 400;
	function intent( grid ) {
		if ( grid.dataset.riffRackIntent ) {
			return;
		}
		grid.dataset.riffRackIntent = '';
		let timer = 0;
		const open = ( card ) => {
			for ( const c of grid.querySelectorAll( '.riff-card.is-out' ) ) {
				if ( c !== card ) {
					c.classList.remove( 'is-out' );
				}
			}
			card?.classList.add( 'is-out' );
		};
		grid.addEventListener( 'pointerover', ( e ) => {
			const card = e.target.closest( '.riff-card' );
			if ( ! card || e.pointerType === 'touch' ) {
				return;
			}
			clearTimeout( timer );
			if ( ! card.classList.contains( 'is-out' ) ) {
				const browsing = !! grid.querySelector( '.riff-card.is-out' );
				timer = setTimeout( () => open( card ), browsing ? BROWSE : REST );
			}
		} );
		grid.addEventListener( 'pointerleave', () => {
			clearTimeout( timer );
			timer = setTimeout( () => open( null ), LEAVE );
		} );
	}

	function set( grid, on ) {
		grid.classList.toggle( 'riff-rack', on );
		if ( on ) {
			spines( grid );
			intent( grid );
		}
		for ( const b of view.querySelectorAll( '[data-riff-rack]' ) ) {
			b.setAttribute(
				'aria-pressed',
				String( ( b.dataset.riffRack === 'shelf' ) === on )
			);
		}
	}

	// On every view that is Albums: the switch beside its title, and the shelf if it was chosen.
	function rackUp() {
		const grid = albums();
		if ( ! grid ) {
			return;
		}
		const heading = grid.previousElementSibling;
		if ( heading && ! view.querySelector( '.riff-rack-switch' ) ) {
			const group = document.createElement( 'div' );
			group.className = 'riff-rack-switch';
			group.setAttribute( 'role', 'group' );
			group.setAttribute( 'aria-label', __( 'Show albums as', 'riff' ) );
			for ( const [ kind, label, icon ] of [
				[ 'grid', __( 'Grid', 'riff' ), GRID ],
				[ 'shelf', __( 'Shelf', 'riff' ), SHELF ],
			] ) {
				const b = document.createElement( 'button' );
				b.type = 'button';
				b.className = 'riff-btn';
				b.dataset.riffRack = kind;
				b.setAttribute( 'aria-label', label );
				b.innerHTML = icon;
				b.addEventListener( 'click', () => {
					const on = kind === 'shelf';
					write( localStorage, KEY, on ? 'on' : 'off' );
					set( grid, on );
				} );
				group.append( b );
			}
			heading.after( group );
		}
		set( grid, read( localStorage, KEY ) === 'on' );
	}

	// ---- The cover carried into the album's page. Pressing a card names its cover; the swap names
	// the cover at the head of the page it opens, and the browser moves one into the other.
	const NAME = 'riff-album-cover';
	let carried = null;
	view.addEventListener(
		'click',
		( e ) => {
			const card = e.target.closest( '.riff-card[data-riff-album]' );
			const img = card?.querySelector( '.riff-card-art img' );
			if ( ! img || e.target.closest( '.riff-card-play' ) ) {
				return;
			}
			carried?.style.removeProperty( 'view-transition-name' );
			img.style.viewTransitionName = NAME;
			carried = img;
		},
		true
	);
	// Called as the next view goes in: the head of an album's page takes the name, and gives it up
	// once the move is over, so the next view change starts clean.
	function rackLand() {
		if ( ! carried ) {
			return;
		}
		carried = null;
		const cover = view.querySelector( '.riff-album-cover img' );
		if ( ! cover ) {
			return;
		}
		cover.style.viewTransitionName = NAME;
		setTimeout( () => cover.style.removeProperty( 'view-transition-name' ), 1000 );
	}

	return { rackUp, rackLand };
}
