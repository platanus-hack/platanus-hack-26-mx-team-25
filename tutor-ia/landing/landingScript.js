// Configuracion de Tailwind (debe ejecutarse antes de que Tailwind escanee el DOM)
tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            "colors": {
                "surface": "#fdf8f8",
                "surface-container-low": "#f7f3f2",
                "surface-container-highest": "#e5e2e1",
                "on-tertiary-container": "#9f9b98",
                "on-secondary-container": "#626363",
                "tertiary-fixed-dim": "#cac6c2",
                "surface-bright": "#fdf8f8",
                "on-primary-container": "#9c9b9b",
                "on-secondary-fixed": "#1a1c1c",
                "on-primary-fixed": "#1b1c1c",
                "inverse-primary": "#c8c6c6",
                "secondary-container": "#e0dfdf",
                "error-container": "#ffdad6",
                "secondary": "#5e5e5f",
                "on-tertiary": "#ffffff",
                "on-error-container": "#93000a",
                "primary": "#1e1e1e",
                "primary-fixed-dim": "#c8c6c6",
                "error": "#ba1a1a",
                "on-background": "#1c1b1b",
                "on-secondary": "#ffffff",
                "tertiary": "#201e1c",
                "on-tertiary-fixed": "#1d1b1a",
                "on-primary-fixed-variant": "#474747",
                "on-error": "#ffffff",
                "outline": "#747878",
                "surface-container-lowest": "#ffffff",
                "secondary-fixed": "#e3e2e2",
                "surface-container-high": "#ebe7e7",
                "tertiary-fixed": "#e7e1de",
                "on-primary": "#ffffff",
                "tertiary-container": "#353331",
                "inverse-surface": "#313030",
                "surface-variant": "#e5e2e1",
                "background": "#fdf8f8",
                "secondary-fixed-dim": "#c7c6c6",
                "on-surface": "#1c1b1b",
                "on-surface-variant": "#444748",
                "surface-tint": "#5f5e5e",
                "surface-dim": "#ddd9d8",
                "primary-fixed": "#e4e2e1",
                "on-secondary-fixed-variant": "#464747",
                "on-tertiary-fixed-variant": "#494644",
                "surface-container": "#f1edec",
                "outline-variant": "#c4c7c7",
                "inverse-on-surface": "#f4f0ef",
                "primary-container": "#333333"
            },
            "borderRadius": {
                "DEFAULT": "0.25rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
                "full": "9999px"
            },
            "spacing": {
                "section-gap": "80px",
                "unit": "8px",
                "container-padding": "40px",
                "gutter": "24px",
                "mobile-margin": "20px"
            },
            "fontFamily": {
                "body-sm": ["Hanken Grotesk"],
                "headline-lg-mobile": ["Hanken Grotesk"],
                "body-main": ["Hanken Grotesk"],
                "label-mono": ["JetBrains Mono"],
                "display": ["Hanken Grotesk"],
                "headline-lg": ["Hanken Grotesk"]
            },
            "fontSize": {
                "body-sm": ["15px", {"lineHeight": "1.5", "fontWeight": "400"}],
                "headline-lg-mobile": ["24px", {"lineHeight": "1.2", "fontWeight": "400"}],
                "body-main": ["18px", {"lineHeight": "1.6", "fontWeight": "400"}],
                "label-mono": ["13px", {"lineHeight": "1.0", "letterSpacing": "0.05em", "fontWeight": "500"}],
                "display": ["48px", {"lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "300"}],
                "headline-lg": ["32px", {"lineHeight": "1.2", "fontWeight": "400"}]
            }
        },
    },
};

