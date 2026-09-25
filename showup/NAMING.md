# Showup: name, domain and clearance

Decided 2026-09-25 (Planwright "Showup 03"): keep the name **Showup**, served at **`showup.cloudcurio.com`**.

## Domain and DNS

- `cloudcurio.com` is an existing domain, registered at Namecheap (expires 2027-08-05), using Namecheap's nameservers (`dns1/dns2.registrar-servers.com`). Nothing to register.
- `showup.cloudcurio.com` had no A/CNAME record and there is no wildcard record (checked with `dig` on 2026-09-25).
- To go live: in Namecheap Advanced DNS add an A record, host `showup`, value `50.6.224.185` (the Bluehost VPS). Do this in Showup 05, once the nginx-proxy-manager proxy host exists. Like other VPS subdomains it also needs the hairpin-NAT alias on the `nginxproxymanager` container.

## Name collisions (web search, 2026-09-25)

No screen-sharing or meeting product named Showup turned up, but the name is crowded in adjacent software:

- ShowUp – Plan Together (Juntos Inc.): group planning/messaging app on the Apple App Store.
- ShowUp at joinshowup.io: vendor management platform for event organizers.
- Showup Lab (showuplab.com): event operations platform.
- ShowUp by Dovico Software Inc. (showup.dovico.com).
- getshowup.com: location-based rewards/contests app.
- A location-based social app named ShowUp on Google Play.
- USPTO "SHOW UP, SHOW APP" (2012, class 9, mobile coupon software): abandoned.

## Not done

- USPTO and EUIPO were not searched directly (only web search was available). Treat the trademark check as indicative. A proper search of classes 9, 38 and 42 is worth doing before investing in branding or paid promotion.
- Runners-up (Dropin, Hopon, Presently) were not researched, since Showup was kept.
- `showup.app` and `getshowup.com` are not used; `getshowup.com` is taken by an unrelated product.

## Residual risk

Being a subdomain of Cloudcurio keeps switching cheap: a rename means a new subdomain, DNS record, proxy host and cert. It gets more expensive once webhook URLs and branding are in place.
