/**
 * Where feedback goes.
 *
 * A wa.me link opens WhatsApp with the thread already started — nothing to
 * build, no inbox to staff, and it arrives somewhere that actually gets read.
 * At this size that beats a form writing to a table nobody checks.
 *
 * The number is in the page's HTML, so treat it as public: anyone who views
 * source has it, and scrapers will eventually find it. That's the trade for
 * not running a support desk. Swapping this for a Google Form or a support
 * address later means changing this one constant.
 */
const SUPPORT_WHATSAPP = '2348162589880'

/** Prefilled so a message arrives with its context already attached. */
export const SUPPORT_URL = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
  'Feedback for SyncinLove: ',
)}`
