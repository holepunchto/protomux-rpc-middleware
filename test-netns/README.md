## test-netns (Linux-only, advanced)

This is an advanced test suite that verifies IP-based behavior using Linux network namespaces. It is intended for contributors who are comfortable with low-level networking. It only runs on Linux and requires root privileges (or `sudo`) to create and manipulate namespaces.

### What this tests

- **Rate limiting by IP**: Ensures separate clients in different network namespaces (with distinct IPs) are rate-limited independently, using `RateLimit.byIp(...)`.

### How it works

- A bridge interface (`test-bridge`) is created in the root namespace with IP `10.200.1.1/24`.
- Two namespaces are created: `test-net-1` (`10.200.1.2/24`) and `test-net-2` (`10.200.1.3/24`), each attached to the bridge via veth pairs.
- The test server binds to the bridge IP and clients are executed inside each namespace via `ip netns exec ... node test-netns/make-request.js`.
- The suite asserts that requests from each namespace are counted independently for rate limiting.

### Run locally

1. Setup namespaces and bridge:

```bash
sudo test-netns/scripts/setup.sh
```

2. Run the tests (requires elevated privileges because tests exec into namespaces):

```bash
sudo npm run test:netns
```

3. Teardown and cleanup:

```bash
sudo test-netns/scripts/teardown.sh
```

### CI

On Ubuntu CI, the workflow runs the same steps: setup namespaces, run `npm run test:netns`, then teardown.

### Notes

- This section is for advanced contributors; running it modifies local networking state during the test window.
- Always run the teardown script to avoid leaving namespaces/links behind.

### References

- [Linux network namespaces (man7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html)
- [`ip` — show / manipulate routing, devices, policy routing, and tunnels (man7)](https://man7.org/linux/man-pages/man8/ip.8.html)
- [`ip-netns` — manage network namespaces (man7)](https://man7.org/linux/man-pages/man8/ip-netns.8.html)
