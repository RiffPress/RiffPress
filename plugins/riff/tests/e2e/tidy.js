/**
 * Layout checks for the rows of cards Home, Your Library and an artist's page are made of: every
 * card in a row the same width, every cover square and the same height, and no card over another.
 */
const { expect } = require( '@wordpress/e2e-test-utils-playwright' );

/**
 * The cards in each visible row of a region, measured.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to measure inside.
 * @return {Promise<Object[]>} One entry per row: its slug and its cards' boxes.
 */
function measure( page, region ) {
	return page.evaluate( ( selector ) => {
		const box = ( el ) => {
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		};
		return [ ...document.querySelectorAll( `${ selector } .riff-shelf-row, ${ selector } .riff-grid` ) ]
			.filter( ( row ) => row.offsetParent !== null )
			.map( ( row ) => ( {
				name: row.closest( '[data-riff-shelf]' )?.dataset.riffShelf || 'grid',
				cards: [ ...row.children ]
					.filter( ( c ) => c.matches( '.riff-card' ) )
					.map( ( c ) => ( {
						title: c.querySelector( '.riff-card-title' )?.textContent || '',
						card: box( c ),
						art: box( c.querySelector( '.riff-card-art' ) ),
					} ) ),
			} ) );
	}, region );
}

/**
 * Expects every row of cards in a region to be tidy.
 *
 * @param {import('@playwright/test').Page} page   Page.
 * @param {string}                          region Selector of what to check inside.
 * @param {string}                          where  What is being checked, for the messages.
 */
async function expectTidyCards( page, region, where ) {
	const rows = await measure( page, region );
	expect( rows.length, `${ where }: some rows of cards` ).toBeGreaterThan( 0 );
	for ( const { name, cards } of rows ) {
		const at = `${ where }, ${ name }`;
		if ( ! cards.length ) {
			continue;
		}
		const width = cards[ 0 ].card.w;
		const cover = cards[ 0 ].art.h;
		for ( const c of cards ) {
			expect( Math.abs( c.card.w - width ), `${ at }: “${ c.title }” is as wide as the first card` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.h - cover ), `${ at }: “${ c.title }” has a cover as tall as the first` ).toBeLessThan( 1.5 );
			expect( Math.abs( c.art.w - c.art.h ), `${ at }: “${ c.title }” has a square cover` ).toBeLessThan( 1.5 );
			expect( c.art.w, `${ at }: “${ c.title }” has its cover inside the card` ).toBeLessThanOrEqual( c.card.w + 0.5 );
		}
		for ( let i = 0; i < cards.length; i++ ) {
			for ( let j = i + 1; j < cards.length; j++ ) {
				const a = cards[ i ].card;
				const b = cards[ j ].card;
				const apart = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
				expect( apart, `${ at }: “${ cards[ i ].title }” and “${ cards[ j ].title }” do not overlap` ).toBe( true );
			}
		}
	}
}

module.exports = { expectTidyCards };
