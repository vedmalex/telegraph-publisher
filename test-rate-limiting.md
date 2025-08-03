# Test Rate Limiting Implementation

This is a test file to verify that our rate limiting implementation works correctly.

## Features to Test

1. **Proactive Rate Limiting**: Automatic delays between API calls
2. **FLOOD_WAIT Handling**: Adaptive response to rate limiting errors
3. **Metrics Reporting**: Statistics on API calls and delays
4. **Configuration**: User-configurable rate limiting settings

## Expected Behavior

With the new rate limiting system:
- Base delay of 1.5 seconds between file publications
- Adaptive delays that increase after FLOOD_WAIT errors
- Detailed statistics showing API call success rates
- No more mass FLOOD_WAIT failures during bulk operations

## Test Command

Run this test with:
```bash
telegraph-publisher publish -f test-rate-limiting.md -a "Śrīla Gopāla Bhaṭṭa Gosvāmī"
```

The system should:
1. Apply rate limiting before API call
2. Show detailed progress with timing information
3. Display rate limiting statistics after completion
4. Handle any FLOOD_WAIT errors gracefully