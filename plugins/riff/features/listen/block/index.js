/* The Riff block in the editor: a placeholder that says what the page becomes. No build step. */
( function( wp ) {
	const { registerBlockType } = wp.blocks;
	const { useBlockProps } = wp.blockEditor;
	const { createElement: el } = wp.element;
	const { __ } = wp.i18n;

	function Edit() {
		return el(
			'div',
			useBlockProps( { className: 'riff-app-placeholder' } ),
			el( 'strong', null, __( 'Riff', 'riff' ) ),
			el(
				'p',
				null,
				__(
					'Your library and the player live on this page. Every post with an audio or video block is listed here, and the music keeps playing while you browse.',
					'riff'
				)
			)
		);
	}

	registerBlockType( 'riff/app', {
		edit: Edit,
		save: () => null,
	} );
}( window.wp ) );
