import * as CLVM from './index';

declare global {
    interface Window {
        CLVM: typeof CLVM;
    }
}

window.CLVM = CLVM;
