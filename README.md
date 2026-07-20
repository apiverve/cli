# APIVerve CLI

**Call 368+ APIs from a single command** — weather, geocoding, validation, financial data, DNS, and more. One tool, every APIVerve API, runs anywhere.

```bash
apiverve marineweather --lat 29.48 --lon -37.62
```

The full API catalog is baked into the CLI, so `list`, `--help`, and input validation all work **offline** — the only network call is the API request itself.

---

## Install

Pick whichever fits your environment. It's the same `apiverve` command everywhere.

### npm (Node 18+)

```bash
npm install -g @apiverve/cli
apiverve --version
```

### npx (no install)

```bash
npx @apiverve/cli marineweather --lat 29.48 --lon -37.62
```

### Docker (zero install)

```bash
docker run --rm -e APIVERVE_API_KEY=$APIVERVE_API_KEY apiverve/cli marineweather --lat 29.48 --lon -37.62
```

Alias it for convenience:

```bash
alias apiverve='docker run --rm -e APIVERVE_API_KEY=$APIVERVE_API_KEY apiverve/cli'
```

---

## Authentication

Get a free API key at **[https://apiverve.com](https://apiverve.com)**, then either export it or pass it per call:

```bash
export APIVERVE_API_KEY=your_key_here      # recommended
apiverve emailvalidator --email support@myspace.com

apiverve emailvalidator --email support@myspace.com --api-key your_key_here
```

The key is read from `--api-key`, then `APIVERVE_API_KEY`, then `APIVERVE_KEY`.

---

## Usage

```
apiverve <api> [--param value ...]      Call an API
apiverve list [--category <c>] [--search <t>] [--json]
apiverve categories                     List categories with counts
apiverve <api> --help                   Show an API's parameters and example
apiverve --version
```

### Discover APIs

```bash
apiverve list                    # all 368 APIs
apiverve list --category Weather # filter by category
apiverve list --search email     # search id / title / description
apiverve categories              # every category with a count
```

### Inspect an API before calling it

```bash
apiverve marineweather --help
```

```
Marine Weather  (marineweather)
Weather

Get the marine weather data for a location using latitude and longitude coordinates

Parameters:
  --lat <number> (required)
      The latitude coordinate of the location
  --lon <number> (required)
      The longitude coordinate of the location

Example:
  apiverve marineweather --lat 29.48003 --lon -37.62424
```

---

## Output & scripting

- The response **`data`** is printed as JSON to **stdout** (`--raw` prints the full `{ status, error, data }` envelope).
- Output is **pretty** in a terminal and **compact** when piped, so it drops straight into `jq`.
- Errors go to **stderr**. Exit codes: **`0`** ok · **`1`** API error · **`2`** usage/validation error.

```bash
# Pipe into jq
apiverve emailvalidator --email support@myspace.com | jq '.valid'

# Use in a script with proper error handling
if temp=$(apiverve marineweather --lat 29.48 --lon -37.62 | jq -r '.temperature'); then
  echo "Water temp: $temp"
else
  echo "Lookup failed" >&2
fi
```

### In CI/CD (GitHub Actions)

```yaml
- name: Check SSL expiry
  run: |
    docker run --rm -e APIVERVE_API_KEY=$ secrets.APIVERVE_API_KEY  \
      apiverve/cli sslcertificatechecker --domain example.com | jq '.daysRemaining'
```

---

## Validation

Required and mistyped parameters are caught **before** a request is sent (and before any credit is spent):

```bash
$ apiverve marineweather --lat abc
Invalid input for 'marineweather':
  - --lat must be a number
  - --lon is required (number)

Run 'apiverve marineweather --help' for the parameters.
```

---

## Links

- Website: [https://apiverve.com](https://apiverve.com)
- Docs: [https://docs.apiverve.com](https://docs.apiverve.com)
- Source: [github.com/apiverve/cli](https://github.com/apiverve/cli)
- Docker image: [`apiverve/cli`](https://hub.docker.com/r/apiverve/cli)

## License

MIT © APIVerve
