# @forklaunch/healthcare-leadgen-ui

Sealed UI for the Healthcare Leadgen Ideas Portal: the complete physician/
clinician idea-submission experience — AI evaluation and refinement loop,
mutual NDA gate, live encryption demo, storage inspector — plus the
cross-organization admin console. Themable and organization-configurable;
a per-customer frontend is one config file around these components.

```tsx
import { PortalApp } from '@forklaunch/healthcare-leadgen-ui';
import '@forklaunch/healthcare-leadgen-ui/styles.css';

<PortalApp
  config={{
    apiUrl: 'https://api.example.com',
    organization: { slug: 'mcg', displayName: 'MCG Health' },
    branding: { institution: 'Medical College of Georgia', portalName: 'Ideas Portal', tagline: '…' },
    theme: { brand: '#00305e', accent: '#8ea9c9' }
  }}
/>
```

Exports: `PortalApp`, `AdminApp`, `EncryptionShowcase`, `ScrambleText`,
`PortalClient`, `AdminClient`, and the `PortalConfig` / `AdminConfig` /
`PortalTheme` types.

## See the code

| Repo | Role |
| --- | --- |
| [forklaunch/healthcare-leadgen](https://github.com/forklaunch/healthcare-leadgen) | **Centralized** — the multi-tenant backend (org registry, AI evaluation via Azure AI Foundry, PHI-grade encrypted storage) and this package's source at [`packages/portal-ui`](https://github.com/forklaunch/healthcare-leadgen/tree/main/packages/portal-ui). |
| [forklaunch/template-healthcare-leadgen](https://github.com/forklaunch/template-healthcare-leadgen) | **Distributed** — the forkable per-customer frontend template that consumes this package. Live examples: [uchicago-healthcare-leadgen](https://github.com/forklaunch/uchicago-healthcare-leadgen), [mcg-healthcare-leadgen](https://github.com/forklaunch/mcg-healthcare-leadgen). |

## License

MIT
