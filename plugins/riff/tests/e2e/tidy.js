/**
 * Layout checks for any region of the Listen block: nothing laid over its neighbour, every card in
 * a row or grid the same width with a square cover of one height, nothing wider than the window,
 * and no text cut off. Each check names what it found, so a failure says where to look.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * Everything the checks need, measured in the page in one pass.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to measure inside.
 * @return {Promise<Object>} Rows of cards, overlapping siblings, overflow and cut-off text.
 */
function measure( page, region ) {
	return page.evaluate( ( selector ) => {
		const root = document.querySelector( selector );
		if ( ! root ) {
			return null;
		}
		const box = ( el ) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		};
		const seen = ( el ) => {
			if ( el.closest( '[hidden], template' ) ) {
				return false;
			}
			const style = getComputedStyle( el );
			const r = el.getBoundingClientRect();
			return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
		};
		const name = ( el ) => {
			const text = ( el.textContent || '' ).trim().replace( /\s+/g, ' ' ).slice( 0, 40 );
			return `${ el.tagName.toLowerCase() }.${ [ ...el.classList ].join( '.' ) }${ text ? ` “${ text }”` : '' }`;
		};

		// Rows and grids of cards.
		const rows = [ ...root.querySelectorAll( '.riff-shelf-row, .riff-grid' ) ]
			.filter( seen )
			.map( ( row ) => ( {
				name: row.closest( '[data-riff-shelf]' )?.dataset.riffShelf || 'grid',
				cards: [ ...row.children ]
					.filter( ( c ) => c.matches( '.riff-card' ) && seen( c ) )
					.map( ( c ) => ( {
						title: c.querySelector( '.riff-card-title' )?.textContent || '',
						card: box( c ),
						art: box( c.querySelector( '.riff-card-art' ) ),
					} ) ),
			} ) );

		// Siblings in the flow laid over one another. Absolutely placed pieces (a cover's play
		// button, a row's heart) sit over their parent by design and are left out.
		const overlaps = [];
		for ( const parent of [ root, ...root.querySelectorAll( '*' ) ] ) {
			if ( parent.closest( 'svg' ) || ! seen( parent ) ) {
				continue;
			}
			const kids = [ ...parent.children ].filter( ( c ) => {
				const pos = getComputedStyle( c ).position;
				return seen( c ) && pos !== 'absolute' && pos !== 'fixed' && c.tagName !== 'svg';
			} );
			for ( let i = 0; i < kids.length; i++ ) {
				for ( let j = i + 1; j < kids.length; j++ ) {
					const a = kids[ i ].getBoundingClientRect();
					const b = kids[ j ].getBoundingClientRect();
					const x = Math.min( a.right, b.right ) - Math.max( a.left, b.left );
					const y = Math.min( a.bottom, b.bottom ) - Math.max( a.top, b.top );
					if ( x > 1 && y > 1 ) {
						overlaps.push( `${ name( kids[ i ] ) } and ${ name( kids[ j ] ) }` );
					}
				}
			}
		}

		// Text that is cut off: past its box's bottom, or past its side without an ellipsis.
		const clipped = [];
		for ( const el of [ root, ...root.querySelectorAll( '*' ) ] ) {
			if ( ! seen( el ) || el.closest( 'svg' ) ) {
				continue;
			}
			const own = [ ...el.childNodes ].some( ( n ) => n.nodeType === Node.TEXT_NODE && n.data.trim() );
			if ( ! own ) {
				continue;
			}
			const style = getComputedStyle( el );
			const hides = style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible';
			if ( ! hides && ! el.closest( '[style*="overflow"]' ) ) {
				continue;
			}
			if ( el.scrollHeight > el.clientHeight + 1 ) {
				clipped.push( `${ name( el ) } is cut off at the bottom` );
			} else if ( style.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1 ) {
				clipped.push( `${ name( el ) } is cut off at the side` );
			}
		}

		return {
			rows,
			overlaps,
			clipped,
			page: { scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth },
			region: { scroll: root.scrollWidth, width: root.clientWidth },
		};
	}, region );
}

/**
 * Expects a region to be tidy.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to check.
 * @param {string}                          where  What is being checked, for the messages.
 */
async function expectTidy( page, region, where ) {
	const m = await measure( page, region );
	expect( m, `${ where }: ${ region } is on the page` ).not.toBeNull();
	expect( m.page.scroll, `${ where }: the page is no wider than the window (overflow)` ).toBeLessThanOrEqual( m.page.width + 1 );
	expect( m.region.scroll, `${ where }: ${ region } is no wider than itself (overflow)` ).toBeLessThanOrEqual( m.region.width + 1 );
	expect( m.overlaps, `${ where }: nothing overlaps` ).toEqual( [] );
	expect( m.clipped, `${ where }: no text is clipped` ).toEqual( [] );
	for ( const { name, cards } of m.rows ) {
		if ( ! cards.length ) {
			continue;
		}
		const at = `${ where }, ${ name }`;
		const width = cards[ 0 ].card.w;
		const cover = cards[ 0 ].art.h;
		for ( const c of cards ) {
			expect( Math.abs( c.card.w - width ), `${ at }: “${ c.title }” is as wide as the first card (widths)` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.h - cover ), `${ at }: “${ c.title }” has a cover as tall as the first (cover heights)` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.w - c.art.h ), `${ at }: “${ c.title }” has a square cover (square)` ).toBeLessThan( 1.5 );
			expect( c.art.w, `${ at }: “${ c.title }” has its cover inside the card (widths)` ).toBeLessThanOrEqual( c.card.w + 0.5 );
		}
	}
}

module.exports = { expectTidy };
