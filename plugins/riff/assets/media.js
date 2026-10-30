/**
 * The Artwork, Video version, Streaming version and Captions pickers on an audio or video file in
 * the Media Library.
 *
 * Each picker fills in the address field next to it with the chosen attachment's ID, so saving
 * goes through the same checks as a typed address. In the Media Library's own window a change saves
 * at once, and WordPress does not redraw these fields afterwards; the redraw here is what shows the
 * selection the server kept and any error it reported.
 */
( function() {
	const media = window.wp && window.wp.media;
	if ( ! media ) {
		return;
	}

	/**
	 * Fills in the field and shows the selection.
	 *
	 * @param {HTMLElement} picker     The picker.
	 * @param {Object|null} attachment The chosen attachment, or null to remove.
	 */
	function select( picker, attachment ) {
		const input = picker.querySelector( 'input' );
		const preview = picker.querySelector( '.riff-pick-preview' );
		input.value = attachment ? String( attachment.id ) : '';
		preview.replaceChildren();
		if ( attachment && picker.dataset.riffPick === 'image' ) {
			const img = document.createElement( 'img' );
			img.src = attachment.sizes?.thumbnail?.url || attachment.url;
			img.alt = '';
			preview.append( img );
		} else if ( attachment ) {
			preview.textContent = attachment.title;
		}
		picker.querySelector( '[data-riff-action="choose"]' ).textContent =
			attachment ? picker.dataset.riffReplace : picker.dataset.riffChoose;
		picker.querySelector( '[data-riff-action="remove"]' ).hidden =
			! attachment;
		input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	}

	document.addEventListener( 'click', ( event ) => {
		const button = event.target.closest( '[data-riff-pick] button' );
		if ( ! button ) {
			return;
		}
		const picker = button.closest( '[data-riff-pick]' );
		if ( button.dataset.riffAction === 'remove' ) {
			select( picker, null );
			picker.querySelector( '[data-riff-action="choose"]' ).focus();
			return;
		}
		const frame = media( {
			title: button.textContent,
			button: { text: picker.dataset.riffButton },
			library: { type: picker.dataset.riffPick },
			multiple: false,
		} );
		frame.on( 'select', () => {
			const chosen = frame.state().get( 'selection' ).first();
			if ( chosen ) {
				select( picker, chosen.toJSON() );
			}
		} );
		frame.open();
	} );

	// After a save in the Media Library's window, draw the pickers again from the fields the server
	// sent back, keeping focus on the same control.
	media.model.Attachments.all.on( 'change:compat', ( model ) => {
		const item = model.get( 'compat' )?.item;
		if ( ! item ) {
			return;
		}
		const fresh = document.createElement( 'table' );
		fresh.innerHTML = item;
		for ( const field of [
			'riff_art',
			'riff_video',
			'riff_stream',
			'riff_captions',
		] ) {
			const name = `attachments[${ model.id }][${ field }]`;
			const next = fresh
				.querySelector( `[name="${ CSS.escape( name ) }"]` )
				?.closest( '[data-riff-pick]' );
			if ( ! next ) {
				continue;
			}
			for ( const input of [ ...document.getElementsByName( name ) ] ) {
				const picker = input.closest( '[data-riff-pick]' );
				if ( ! picker ) {
					continue;
				}
				const focused = picker.contains( document.activeElement )
					? document.activeElement.dataset.riffAction || 'input'
					: '';
				const copy = next.cloneNode( true );
				picker.replaceWith( copy );
				if ( focused === 'input' ) {
					copy.querySelector( 'input' ).focus();
				} else if ( focused ) {
					(
						copy.querySelector(
							`[data-riff-action="${ focused }"]:not([hidden])`
						) || copy.querySelector( '[data-riff-action="choose"]' )
					).focus();
				}
			}
		}
	} );
}() );
