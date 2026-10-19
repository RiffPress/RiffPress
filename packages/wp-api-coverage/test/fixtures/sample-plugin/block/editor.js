( function () {
	const { registerBlockType } = window.wp.blocks;
	const { blockEditor, i18n: translations } = wp;
	registerBlockType( 'sample/block', {
		edit: () => blockEditor.useBlockProps() && translations.__( 'Sample' ),
	} );
} )();
