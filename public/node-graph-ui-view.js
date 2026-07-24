// The "Patch Control Surface" / WYSIWYG UI-item editor (the "Add Graph UI"
// context-menu button, the #nodeUiView panel, drag/resize of graph editors
// placed on a free-form canvas) has been removed -- it was scaffolding for
// a larger WYSIWYG editor that is being rebuilt differently. All of that
// code (nodeGraphUiItemTypeForNode, createNodeGraphUiItemElement,
// renderNodeGraphUiView, drag/resize handlers, the graph toolbar/inspector
// built for it, etc.) used to live in this file; it's intentionally left
// empty rather than deleted outright, since this session can't remove files
// from your disk. index.html no longer loads this file -- delete it
// whenever convenient.
