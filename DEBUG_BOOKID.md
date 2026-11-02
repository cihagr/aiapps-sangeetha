# Debug Info

The code is already using `bookid` (400) from the get-book-id-name response.

Check browser console for:
- `[SSO Login] ✅ Using bookid: 400 type: number`

This confirms we're extracting bookid correctly.

The UUID `019dced7-029c-7383-9e96-c4c53d03efad` you're seeing must be coming from:
1. A cached/old request
2. Another part of the code overwriting it
3. Browser dev tools showing a different request

The current code at lines ~595 and ~620 uses:
```javascript
book_id: String(bookid || "")
```

This should send "400", not the UUID.

Please clear browser cache and check the Network tab to verify the actual request being sent.
