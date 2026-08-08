package server.agent.android.ui.theme

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import server.agent.android.R

@Composable
fun AppMark(
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
) {
    Image(
        painter = painterResource(R.drawable.ic_app_mark),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier.size(size),
    )
}
