import { SNFile } from '@standardnotes/snjs'
import { FunctionComponent } from 'preact'
import { ImagePreview } from './ImagePreview'

type Props = {
  file: SNFile
  objectUrl: string
}

export const PreviewComponent: FunctionComponent<Props> = ({ file, objectUrl }) => {
  if (file.mimeType.startsWith('image/')) {
    return <ImagePreview objectUrl={objectUrl} />
  }

  if (file.mimeType.startsWith('video/')) {
    return <video className="w-full h-full" src={objectUrl} controls />
  }

  if (file.mimeType.startsWith('audio/')) {
    return <audio src={objectUrl} controls />
  }

  return <object className="w-full h-full" data={objectUrl} />
}
