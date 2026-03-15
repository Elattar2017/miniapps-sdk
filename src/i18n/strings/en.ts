export const EN_STRINGS: Record<string, string> = {
  // Screen messages
  'screen.error.default': 'Failed to load screen',
  'screen.action.goBack': 'Go Back',
  'module.error.loadFailed': 'Failed to load modules',
  'select.placeholder': 'Select an option',
  'repeater.empty': 'No items',
  'chart.noData': 'No data',
  'chart.title.bar': 'Bar Chart',
  'chart.title.line': 'Line Chart',
  'chart.title.pie': 'Pie Chart',

  // Error screen messages
  'screen.error.notFound.title': 'Screen Not Available',
  'screen.error.notFound.description': 'This screen could not be found. It may have been removed or is not yet published.',
  'screen.error.timeout.title': 'Connection Timed Out',
  'screen.error.timeout.description': 'The server took too long to respond. Please check your connection and try again.',
  'screen.error.server.title': 'Something Went Wrong',
  'screen.error.server.description': 'We ran into a problem on our end. Please try again in a moment.',
  'screen.error.network.title': 'No Connection',
  'screen.error.network.description': 'Unable to reach the server. Please check your internet connection and try again.',
  'screen.error.generic.title': 'Unable to Load',
  'screen.error.generic.description': 'Something unexpected happened. Please try again or go back.',
  'screen.action.retry': 'Try Again',

  // Component labels (used by a11y track)
  'loading.label': 'Loading',
  'loading.progress': '{{percent}}% complete',
  'fileUpload.label': 'Select File',
  'fileUpload.fileInfo': 'File: {{name}} ({{size}})',
  'badge.label': 'Badge: {{value}}',
  'divider.label': 'Divider',
  'table.row': 'Row {{index}}',
  'table.sortBy': 'Sort by {{column}}',
  'icon.button': '{{name}} button',
  'icon.image': '{{name}} icon',

  // Pluralization
  'item.count.zero': 'No items',
  'item.count.one': '1 item',
  'item.count.other': '{{count}} items',

  // Media / Camera
  'media.permissionDenied': 'Permission denied. Please allow access in device settings.',
  'media.fileTooLarge': 'File exceeds the maximum size of {{maxSize}} bytes.',
  'media.cancelled': 'Media selection was cancelled.',
  'media.error': 'Failed to capture or select media.',
  'media.camera.label': 'Camera viewfinder',
  'media.capture': 'Capture photo',
  'media.pickPhoto': 'Choose from library',
};
