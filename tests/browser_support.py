"""Use the visible navigation menu at narrow widths."""
def navigate(page, screen):
    button=page.locator('button[data-screen="'+screen+'"]')
    if not button.is_visible():
        page.locator('.oo-navigation > summary').click()
    button.click()
