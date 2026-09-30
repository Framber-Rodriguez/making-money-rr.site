# making-money-RR.site

This is a project about market data and how it can be read for better benefit.

Making Money market analysis application.

## Run
Serve this directory with any static HTTP server, for example `python -m http.server 8000`, then open http://localhost:8000. HTTPS is required for screen sharing on a deployed site.

## Features
- TradingView charts for XAU/USD, Bitcoin, Ethereum and Solana.
- CSV price import and experimental 30-minute directional estimates.
- Kraken crypto monitoring while the page is open.
- Screen capture and image upload.
- English interface, Spanish translation, and additional languages where the browser Translator API supports them.

## Current limits
Gold analysis requires imported CSV price data. TradingView embeds display charts but do not feed our prediction model. Automated image interpretation, server API integration, persistent training, Telegram and SMS are not yet implemented. Kraken connectivity depends on source availability and browser access. Probabilities are experimental, are withheld when the historical test does not beat its baseline, and are not guaranteed or externally calibrated.

No API keys are included in this repository.
