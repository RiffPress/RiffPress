/* Cards are drawn by the server only (Listen\Ui::card()): in a view, at riff/v1/played for a
 * visitor's history, and in the listening room's answer. What the script adds is the fade covers
 * make as they arrive, into room the layout already keeps for them. */

export function cards() {
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

	return { fade };
}
