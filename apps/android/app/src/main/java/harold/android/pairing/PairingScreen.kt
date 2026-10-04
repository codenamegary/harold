package harold.android.pairing

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import harold.android.R

private val MIN_TOUCH_TARGET = 48.dp
private val SCANNER_HEIGHT = 320.dp
private val SCANNER_CORNER = 12.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PairingScreen(
    uiState: PairingUiState,
    onManualEntryClick: () -> Unit,
    onScannerClick: () -> Unit,
    onEndpointChanged: (String) -> Unit,
    onCodeChanged: (String) -> Unit,
    onSubmitManual: () -> Unit,
    onQrScanned: (String) -> Unit,
    onBack: () -> Unit,
) {
    val backContentDescription = stringResource(R.string.pairing_back_content_description)
    val manualEntryContentDescription = stringResource(R.string.pairing_manual_entry_content_description)
    val useScannerContentDescription = stringResource(R.string.pairing_use_scanner_content_description)
    val scannerContentDescription = stringResource(R.string.pairing_scanner_content_description)
    val submitContentDescription = stringResource(R.string.pairing_submit_content_description)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(text = stringResource(R.string.pairing_title)) },
                navigationIcon = {
                    TextButton(
                        onClick = onBack,
                        modifier = Modifier
                            .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                            .semantics {
                                contentDescription = backContentDescription
                            },
                    ) {
                        Text(text = stringResource(R.string.pairing_back))
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp),
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (uiState.isClaiming) {
                Spacer(modifier = Modifier.height(48.dp))
                CircularProgressIndicator()
                Text(
                    text = stringResource(R.string.pairing_claiming),
                    modifier = Modifier.padding(top = 16.dp),
                )
            } else if (uiState.mode == PairingMode.Scan) {
                Spacer(modifier = Modifier.height(16.dp))

                PairingScanner(
                    onQrScanned = onQrScanned,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(SCANNER_HEIGHT)
                        .clip(RoundedCornerShape(SCANNER_CORNER))
                        .testTag("pairing_scanner")
                        .semantics {
                            contentDescription = scannerContentDescription
                        },
                )

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = onManualEntryClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("pairing_manual_entry")
                        .semantics {
                            contentDescription = manualEntryContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.pairing_manual_entry))
                }
            } else {
                OutlinedTextField(
                    value = uiState.endpoint,
                    onValueChange = onEndpointChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("pairing_endpoint_field"),
                    label = { Text(text = stringResource(R.string.pairing_endpoint_label)) },
                    singleLine = true,
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = uiState.code,
                    onValueChange = onCodeChanged,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("pairing_code_field"),
                    label = { Text(text = stringResource(R.string.pairing_code_label)) },
                    singleLine = true,
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = onSubmitManual,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .testTag("pairing_submit_button")
                        .semantics {
                            contentDescription = submitContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.pairing_submit))
                }

                TextButton(
                    onClick = onScannerClick,
                    modifier = Modifier
                        .defaultMinSize(minHeight = MIN_TOUCH_TARGET)
                        .semantics {
                            contentDescription = useScannerContentDescription
                        },
                ) {
                    Text(text = stringResource(R.string.pairing_use_scanner))
                }
            }

            uiState.errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .padding(top = 16.dp)
                        .testTag("pairing_error")
                        .semantics {
                            liveRegion = LiveRegionMode.Polite
                        },
                )
            }
        }
    }
}

@Composable
private fun PairingScanner(
    onQrScanned: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    if (!hasCameraPermission) {
        Text(
            text = stringResource(R.string.pairing_camera_permission_required),
            modifier = Modifier.padding(top = 24.dp),
        )
        return
    }

    // COMPATIBLE uses TextureView so the preview respects Compose z-order.
    // PERFORMANCE (SurfaceView) can draw over siblings like the manual-entry button.
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PreviewView(ctx).apply {
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                scaleType = PreviewView.ScaleType.FILL_CENTER
            }
        },
        update = { previewView ->
            val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

            cameraProviderFuture.addListener(
                {
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also {
                            it.setAnalyzer(
                                ContextCompat.getMainExecutor(context),
                                QrCodeAnalyzer(onQrScanned),
                            )
                        }

                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        analysis,
                    )
                },
                ContextCompat.getMainExecutor(context),
            )
        },
    )

    DisposableEffect(lifecycleOwner) {
        onDispose {
            runCatching {
                ProcessCameraProvider.getInstance(context).get().unbindAll()
            }
        }
    }
}
