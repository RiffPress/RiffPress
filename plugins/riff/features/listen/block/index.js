/* The Riff block in the editor: the library as it will be on the page, rendered by the server, the way
   core's dynamic blocks preview themselves. No build step. */
( function( wp ) {
	const { registerBlockType } = wp.blocks;
	const { useBlockProps } = wp.blockEditor;
	const { Disabled } = wp.components;
	const ServerSideRender = wp.serverSideRender;
	const { createElement: el } = wp.element;

	function Edit( { attributes } ) {
		return el(
			'div',
			useBlockProps(),
			el(
				Disabled,
				null,
				el( ServerSideRender, { block: 'riff/app', attributes } )
			)
		);
	}

	registerBlockType( 'riff/app', {
		edit: Edit,
		save: () => null,
	} );
}( window.wp ) );
