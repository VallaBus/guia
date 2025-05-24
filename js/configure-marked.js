// Configurar marked para mejorar el renderizado de Markdown
(function configureMarked() {
  if (window.marked) {
    // Configurar opciones globales para marked
    window.marked.use({
      headerIds: true,
      headerPrefix: 'privacy-heading-',
      gfm: true,
      breaks: true
    });
  }
})();
