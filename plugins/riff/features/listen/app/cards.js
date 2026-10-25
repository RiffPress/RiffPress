/* Cards: a post, an album or a played track as the one card template the server prints in the
 * block (Listen\Ui::card()), so a card the script adds is the same markup as one the server drew.
 * And the fade covers make as they arrive, into room the layout already keeps for them. */
import { fmt } from 'riff-app/helpers';

export function cards( ctx ) {
	const { app, __, _n } = ctx;

	// Covers fade in as they arrive; one that has loaded already shows as it is. Without the script
	// there is no fade, and nothing is hidden.
	function fade( root ) {
		for ( const img of root.querySelectorAll( 'img' ) ) {
			if ( img.complete ) {
				continue;
			}
			img.dataset.riffFade = '';
			const done = () => img.removeAttribute( 'data-riff-fade' );
			img.addEventListener( 'load', done, { once: true } );
			img.addEventListener( 'error', done, { once: true } );
		}
	}

	// Each part of the template is filled or removed.
	const template = app.querySelector( 'template[data-riff-card-template]' );
	function makeCard( {
		art,
		title,
		sub,
		href,
		play,
		label,
		data = {},
		id = '',
	} ) {
		const card = template.content.firstElementChild.cloneNode( true );
		card.classList.remove( 'riff-card-template' );
		for ( const [ name, value ] of Object.entries( data ) ) {
			card.setAttribute( `data-riff-${ name }`, String( value ) );
		}
		if ( id ) {
			card.id = id;
		}
		const src = art?.length ? art[ art.length - 1 ].src : '';
		const img = card.querySelector( '.riff-card-art img' );
		if ( src ) {
			// A cover that will not load leaves the card's own ground, not a broken image.
			img.addEventListener( 'error', () => img.remove(), { once: true } );
			img.src = src;
		} else {
			img.remove();
		}
		const button = card.querySelector( '.riff-card-play' );
		button.dataset.riffAppAction = play.action;
		for ( const [ name, value ] of Object.entries( play.data || {} ) ) {
			button.setAttribute( `data-riff-${ name }`, String( value ) );
		}
		button.setAttribute(
			'aria-label',
			fmt(
				/* translators: %s: track title. */ __( 'Play %s', 'riff' ),
				label
			)
		);
		const link = card.querySelector( '.riff-card-link' );
		link.querySelector( '.riff-card-title' ).textContent = title;
		if ( href ) {
			link.href = href;
		} else {
			link.replaceWith( link.firstElementChild );
		}
		card.querySelector( '.riff-card-sub' ).textContent = sub || '';
		return card.outerHTML;
	}

	// A post in the grid, as Listen\App::card() draws one.
	const card = ( item, first = 0 ) =>
		makeCard( {
			art: item.art,
			title: item.title,
			sub: meta( item ),
			href: ctx.addressOf( item.id ),
			play: { action: 'play-card', data: { post: item.id } },
			label: item.title,
			data: { post: item.id },
			id: first ? `riff-page-${ first }` : '',
		} );

	// A page of cards; the first of every page after the first is where Load more's link lands.
	const cardsOf = ( items, n ) =>
		items
			.map( ( item, i ) => card( item, i === 0 && n > 1 ? n : 0 ) )
			.join( '' );

	// "Artist · 10 tracks · 7 min". The server writes it into the item, with the language's own
	// plural forms; the rest is for a source that does not.
	function meta( item ) {
		if ( typeof item.meta === 'string' ) {
			return item.meta;
		}
		const parts = [];
		if ( item.artist ) {
			parts.push( item.artist );
		}
		parts.push(
			fmt(
				/* translators: %s: number of tracks. */
				_n( '%s track', '%s tracks', item.count, 'riff' ),
				item.count
			)
		);
		const minutes = Math.round( ( item.duration || 0 ) / 60 );
		if ( minutes ) {
			parts.push(
				fmt(
					/* translators: %s: number of minutes. */ __(
						'%s min',
						'riff'
					),
					minutes
				)
			);
		}
		return parts.join( ' · ' );
	}

	return { fade, makeCard, cardsOf };
}
