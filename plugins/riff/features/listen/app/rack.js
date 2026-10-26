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
// Solid, as the app's other icons: four squares for the grid, and for the shelf one record faced
// with others behind it, unlike the library's upright bars in the sidebar.
const GRID =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/></svg>';
const SHELF =
	'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M7 19h10V4H7v15zm-5-2h4V6H2v11zM18 6v11h4V6h-4z"/></svg>';

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
