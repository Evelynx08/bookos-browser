// Cargador de bookos.cfg, que vive en la raíz de la instalación. Sin sandbox
// porque bookos.cfg necesita Services y ChromeUtils para montar la interfaz.
pref("general.config.filename", "bookos.cfg");
pref("general.config.obscure_value", 0);
pref("general.config.sandbox_enabled", false);
